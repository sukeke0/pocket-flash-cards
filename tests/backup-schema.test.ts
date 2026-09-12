import { describe, expect, it } from 'vitest';
import { parseBackupData } from '../src/lib/transfer/backupSchema';

const card = {
  id: 'c', frontText: 'apple', backText: 'りんご', frontImage: null, backImage: null,
  tags: [], createdAt: 1, updatedAt: 2, reviewCount: 0, lastReviewedAt: null,
  nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0,
};
const backup = () => ({ schemaVersion: 1, cards: [card], tags: [], decks: [] });
describe('backup schema compatibility', () => {
  it('reads older v1 data with optional fields absent and strips unknown fields', () => {
    const result = parseBackupData({ ...backup(), cards: [{ ...card, unknown: 'ignore' }] });
    expect(result.cards[0]).toEqual({ ...card, notes: '', customFields: {} });
    expect(result.reviews).toEqual([]);
  });
  it.each([
    { reviewCount: 1.5 }, { difficulty: 11 }, { masteryLevel: -1 },
    { stability: Infinity }, { nextReviewAt: 8.64e15 + 1 }, { reviewCount: '3' },
    { customFields: { score: 3 } }, { id: ' ' },
  ])('rejects invalid fields without coercing data (%j)', change => {
    expect(() => parseBackupData({ ...backup(), cards: [{ ...card, ...change }] })).toThrow('形式');
  });
  it('rejects duplicate normalized tag names', () => {
    expect(() => parseBackupData({ ...backup(), tags: [
      { id: 'a', name: 'é', createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'e\u0301', createdAt: 1, updatedAt: 1 },
    ] })).toThrow('タグ名が重複');
  });
});
