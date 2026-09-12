import { languageFields } from '../speech/languages';
import { liveQuery } from 'dexie';
import { db, type CardsDatabase } from './database';
import type { Card, CardInput, Deck, Snapshot, Rating, TextCardInput, ImageCardInput } from '../models';
import { TARGET_IMAGE_BYTES, IMAGE_TYPES } from '../images';
import { MAX_IMPORT_CARDS, textCardKey } from '../transfer/delimited';
import type { Scheduler } from '../srs/types';
import { simpleScheduler } from '../srs/simple';
import { materializeDeck } from '../decks';
import { createSamples } from './samples';
import { copyCardImages } from './cardImages';

export function createRepository(database: CardsDatabase) {
  const deleteCards = async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return 0;
    const removed = new Set(uniqueIds);
    return database.transaction('rw', database.cards, database.decks, database.reviews, async () => {
      const count = await database.cards.where('id').anyOf(uniqueIds).count();
      await database.cards.bulkDelete(uniqueIds);
      await database.reviews.where('cardId').anyOf(uniqueIds).delete();
      const now = Date.now();
      await database.decks.toCollection().modify(deck => {
        if (deck.type === 'fixed' && deck.cardIds.some(id => removed.has(id))) {
          deck.cardIds = deck.cardIds.filter(id => !removed.has(id));
          deck.updatedAt = now;
        }
      });
      return count;
    });
  };
  const deleteDecks = async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return 0;
    return database.transaction('rw', database.decks, async () => {
      const count = await database.decks.where('id').anyOf(uniqueIds).count();
      await database.decks.bulkDelete(uniqueIds);
      return count;
    });
  };
  const snapshot = () => database.transaction('r', database.tables, async (): Promise<Snapshot> => ({
    // Read Blob/File values through the primary store. Some Safari versions return
    // stale file-backed Blob references when reading through an IDBIndex cursor.
    cards: (await database.cards.toArray()).sort((a, b) => a.updatedAt - b.updatedAt).reverse(),
    tags: await database.tags.orderBy('name').toArray(),
    decks: await database.decks.orderBy('updatedAt').reverse().toArray(),
    reviews: await database.reviews.toArray(),
  }));
  return {
    snapshot,
    observe: () => liveQuery(snapshot),
    async resetAllData() {
      const sample = createSamples();
      await database.transaction('rw', database.tables, async () => {
        for (const table of database.tables) await table.clear();
        await database.tags.bulkAdd(sample.tags);
        await database.cards.bulkAdd(sample.cards);
        await database.decks.bulkAdd(sample.decks);
        await database.reviews.bulkAdd(sample.reviews);
      });
    },
    async clearLearningHistory() {
      await database.transaction('rw', database.cards, database.reviews, async () => {
        await database.reviews.clear();
        for (const card of await database.cards.toArray()) {
          await database.cards.put(await copyCardImages({ ...card,
            reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0,
            masteryLevel: 0, difficulty: 5, stability: 0,
          }));
        }
      });
    },
    async importTextCards(rows: TextCardInput[], skipDuplicates = true) {
      if (!rows.length || rows.length > MAX_IMPORT_CARDS) throw new Error('1〜1,000枚のカードを指定してください。');
      const inputs = rows.map(row => ({ ...row, frontText: row.frontText.trim(), backText: row.backText.trim(),
        tagNames: [...new Set(row.tagNames.map(tag => tag.trim().normalize('NFC')).filter(Boolean))] }));
      if (inputs.some(row => !row.frontText || !row.backText || row.tagNames.some(tag => tag.length > 80))) throw new Error('空の表面・裏面、または80文字を超えるタグがあります。');
      return database.transaction('rw', database.cards, database.tags, async () => {
        const keys = new Set<string>();
        if (skipDuplicates) await database.cards.each(card => { keys.add(textCardKey(card)); });
        const knownTags = new Map((await database.tags.toArray()).map(tag => [tag.name, tag.id]));
        const newTags: { id: string; name: string; createdAt: number; updatedAt: number }[] = [];
        const newCards: Card[] = [];
        const now = Date.now();
        let skipped = 0;
        for (const input of inputs) {
          const key = textCardKey(input);
          if (skipDuplicates && keys.has(key)) { skipped++; continue; }
          keys.add(key);
          const tags = input.tagNames.map(name => {
            let id = knownTags.get(name);
            if (!id) { id = crypto.randomUUID(); knownTags.set(name, id); newTags.push({ id, name, createdAt: now, updatedAt: now }); }
            return id;
          });
          newCards.push({ id: crypto.randomUUID(), frontText: input.frontText, backText: input.backText, tags,
            ...languageFields(input), notes: input.notes, frontImage: null, backImage: null, createdAt: now, updatedAt: now,
            reviewCount: 0, lastReviewedAt: null, nextReviewAt: now, masteryLevel: 0, difficulty: 5, stability: 0, customFields: {} });
        }
        await database.tags.bulkAdd(newTags);
        await database.cards.bulkAdd(newCards);
        return { added: newCards.length, skipped, tagsCreated: newTags.length };
      });
    },
    async reviewCard(cardId: string, rating: Rating, reviewId: string, now = Date.now(), scheduler: Scheduler = simpleScheduler) {
      return database.transaction('rw', database.cards, database.reviews, async () => {
        const card = await database.cards.get(cardId);
        if (!card) throw new Error('カードが見つかりません。学習を終了して一覧を確認してください。');
        const previous = await database.reviews.get(reviewId);
        if (previous) {
          if (previous.cardId !== cardId || previous.rating !== rating) throw new Error('この評価はすでに保存されています。');
          return card;
        }
        const result = await copyCardImages({ ...card, ...scheduler.schedule(card, rating, now), updatedAt: now });
        await database.cards.put(result);
        await database.reviews.add({ id: reviewId, cardId, rating, reviewedAt: now, algorithm: scheduler.id,
          previousNextReviewAt: card.nextReviewAt, nextReviewAt: result.nextReviewAt });
        return result;
      });
    },
    async importImageCards(rows: ImageCardInput[]) {
      if (!rows.length || rows.length > MAX_IMPORT_CARDS) throw new Error('カードは1〜1,000枚に分けてください。');
      for (const row of rows) {
        if ((!row.frontText.trim() && !row.frontImage) || (!row.backText.trim() && !row.backImage)) throw new Error('表面または裏面が空のカードがあります。');
        if (row.tagNames.some(name => !name.trim() || name.length > 80)) throw new Error('タグ名が正しくありません。');
        for (const blob of [row.frontImage, row.backImage]) if (blob && (blob.size >= TARGET_IMAGE_BYTES || !IMAGE_TYPES.includes(blob.type))) throw new Error('画像の形式またはサイズが正しくありません。');
      }
      return database.transaction('rw', database.cards, database.tags, async () => {
        const knownTags = new Map((await database.tags.toArray()).map(tag => [tag.name, tag.id]));
        const now = Date.now();
        let tagsCreated = 0;
        const cards: Card[] = [];
        for (const row of rows) {
          const tags: string[] = [];
          for (const name of new Set(row.tagNames.map(tag => tag.trim().normalize('NFC')))) {
            let id = knownTags.get(name);
            if (!id) { id = crypto.randomUUID(); await database.tags.add({ id, name, createdAt: now, updatedAt: now }); knownTags.set(name, id); tagsCreated++; }
            tags.push(id);
          }
          cards.push({ id: crypto.randomUUID(), frontText: row.frontText.trim(), backText: row.backText.trim(), frontImage: row.frontImage, backImage: row.backImage, tags, ...languageFields(row), notes: row.notes, customFields: {}, createdAt: now, updatedAt: now,
            reviewCount: 0, lastReviewedAt: null, nextReviewAt: now, masteryLevel: 0, difficulty: 5, stability: 0 });
        }
        await database.cards.bulkAdd(cards);
        return { added: cards.length, tagsCreated };
      });
    },
    async saveCard(input: CardInput, id?: string) {
      if (!input.frontText.trim() && !input.frontImage) throw new Error('表面にテキストか画像を追加してください。');
      if (!input.backText.trim() && !input.backImage) throw new Error('裏面にテキストか画像を追加してください。');
      return database.transaction('rw', database.cards, database.tags, async () => {
        const existing = id ? await database.cards.get(id) : undefined;
        if (id && !existing) throw new Error('このカードは削除されています。');
        const tags = [...new Set(input.tags)];
        if ((await database.tags.bulkGet(tags)).some(tag => !tag)) throw new Error('タグが見つかりません。もう一度選択してください。');
        const now = Date.now();
        const card: Card = {
          id: crypto.randomUUID(), createdAt: now, reviewCount: 0,
          lastReviewedAt: null, nextReviewAt: now, masteryLevel: 0,
          difficulty: 5, stability: 0, customFields: {},
          ...existing, ...input, ...languageFields(input), tags, updatedAt: now,
          frontText: input.frontText.trim(), backText: input.backText.trim(),
        };
        await database.cards.put(await copyCardImages(card));
        return card.id;
      });
    },
    deleteCards,
    deleteCard: (id: string) => deleteCards([id]),
    async saveTag(name: string, id?: string) {
      const normalized = name.trim().normalize('NFC');
      if (!normalized) throw new Error('タグ名を入力してください。');
      if (normalized.length > 80) throw new Error('タグ名は80文字以内にしてください。');
      return database.transaction('rw', database.tags, async () => {
        const duplicate = await database.tags.where('name').equals(normalized).first();
        if (duplicate && duplicate.id !== id) {
          if (id) throw new Error('同じ名前のタグがすでにあります。');
          return duplicate.id;
        }
        const existing = id ? await database.tags.get(id) : undefined;
        if (id && !existing) throw new Error('タグが見つかりません。');
        const tag = { id: id ?? crypto.randomUUID(), name: normalized, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() };
        await database.tags.put(tag);
        return tag.id;
      });
    },
    async deleteTag(id: string) {
      await database.transaction('rw', database.tags, database.cards, database.decks, async () => {
        await database.tags.delete(id);
        for (const card of await database.cards.where('tags').equals(id).toArray()) {
          await database.cards.put(await copyCardImages({ ...card,
            tags: card.tags.filter(tagId => tagId !== id), updatedAt: Date.now(),
          }));
        }
      });
    },
    async saveDeck(deck: Deck) {
      if (!deck.name.trim()) throw new Error('デッキ名を入力してください。');
      await database.transaction('rw', database.decks, database.tags, database.cards, async () => {
        if (deck.type === 'dynamic') {
          const ids = deck.conditions.flatMap(c => c.field === 'tag' ? [c.value] : []);
          if ((await database.tags.bulkGet(ids)).some(tag => !tag)) throw new Error('存在しないタグが含まれています。');
        } else if ((await database.cards.bulkGet(deck.cardIds)).some(card => !card)) throw new Error('存在しないカードが含まれています。');
        const saved = materializeDeck(deck, deck.type === 'dynamic' ? await database.cards.toArray() : []);
        await database.decks.put({ ...saved, name: deck.name.trim(), updatedAt: Date.now() });
      });
    },
    deleteDecks,
    deleteDeck: (id: string) => deleteDecks([id]),
    touchDeck: (id: string) => database.decks.update(id, { lastUsedAt: Date.now() }),
    async restore(data: Snapshot) {
      await database.transaction('rw', database.tables, async () => {
        for (const table of database.tables) await table.clear();
        await database.cards.bulkAdd(data.cards);
        await database.tags.bulkAdd(data.tags);
        const now = Date.now();
        await database.decks.bulkAdd(data.decks.map(deck => materializeDeck(deck, data.cards, now)));
        await database.reviews.bulkAdd(data.reviews);
      });
    },
  };
}
export const repository = createRepository(db);
