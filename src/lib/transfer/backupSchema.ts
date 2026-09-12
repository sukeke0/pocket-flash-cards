import { z } from 'zod';
import type { Card } from '../models';

export const SCHEMA_VERSION = 1;
export type ArchivedCard = Omit<Card, 'frontImage' | 'backImage'> & { frontImage: string | null; backImage: string | null };

const id = z.string().refine(value => value.trim().length > 0);
const number = z.number().min(0).max(Number.MAX_SAFE_INTEGER);
const time = z.number().min(0).max(8.64e15);
const language = z.string({ error: '読み上げ言語は文字列で指定してください。' }).max(50).optional();
const condition = z.union([
  z.object({ field: z.literal('tag'), value: id }),
  z.object({ field: z.enum(['unlearned', 'due', 'weak']), value: z.boolean() }),
  z.object({ field: z.enum(['masteryLevel', 'reviewCount', 'lastReviewedAt']), operator: z.enum(['gte', 'lte']), value: number }),
]);
const deckBase = { id, name: id, createdAt: time, updatedAt: time, lastUsedAt: time.nullable() };
const card = z.object({
  id, frontText: z.string(), backText: z.string(), frontImage: z.string().nullable(), backImage: z.string().nullable(),
  frontLanguage: language, backLanguage: language, tags: z.array(id), createdAt: time, updatedAt: time,
  reviewCount: number.int(), lastReviewedAt: time.nullable(), nextReviewAt: time,
  masteryLevel: z.number().min(0).max(5), difficulty: z.number().min(1).max(10), stability: number,
  notes: z.string().nullish().transform(value => value ?? ''),
  customFields: z.record(z.string(), z.string()).nullish().transform(value => value ?? {}),
});
const deck = z.discriminatedUnion('type', [
  z.object({ ...deckBase, type: z.literal('fixed'), cardIds: z.array(id) }),
  z.object({ ...deckBase, type: z.literal('dynamic'), match: z.enum(['all', 'any']), conditions: z.array(condition) }),
]);

// Unknown fields are stripped, as in the original importer. Defaults preserve v1
// archives made before notes, custom fields, languages or review history existed.
export const backupSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  cards: z.array(card),
  tags: z.array(z.object({ id, name: id.transform(value => value.normalize('NFC')), createdAt: time, updatedAt: time })),
  decks: z.array(deck),
  reviews: z.array(z.object({
    id, cardId: id, reviewedAt: time, rating: z.enum(['again', 'hard', 'easy']),
    algorithm: z.string(), previousNextReviewAt: time, nextReviewAt: time,
  })).nullish().transform(value => value ?? []),
});

export function parseBackupData(value: unknown) {
  const result = backupSchema.safeParse(value);
  if (!result.success) {
    if (result.error.issues.some(issue => issue.path[0] === 'schemaVersion')) {
      throw new Error(`未対応のschemaVersionです。このアプリはバージョン${SCHEMA_VERSION}に対応しています。`);
    }
    const issue = result.error.issues[0];
    throw new Error(`バックアップのデータ形式が正しくありません（${issue.path.join('.')}）。${issue.message}`);
  }
  const data = result.data;
  for (const items of [data.cards, data.tags, data.decks, data.reviews]) {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('IDが重複しています。');
  }
  if (new Set(data.tags.map(tag => tag.name)).size !== data.tags.length) throw new Error('タグ名が重複しています。');
  const tagIds = new Set(data.tags.map(tag => tag.id));
  const cardIds = new Set(data.cards.map(card => card.id));
  if (data.cards.some(card => card.tags.some(tag => !tagIds.has(tag)))
    || data.reviews.some(review => !cardIds.has(review.cardId))
    || data.decks.some(deck => deck.type === 'fixed' ? deck.cardIds.some(card => !cardIds.has(card))
      : deck.conditions.some(condition => condition.field === 'tag' && !tagIds.has(condition.value)))) {
    throw new Error('参照先が存在しないカード・タグ・履歴があります。');
  }
  return data;
}
