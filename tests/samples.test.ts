import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import { clearDeckSelection, loadDeckSelection, saveDeckSelection } from '../src/lib/autoStudy';
import { calculateStatistics, classifyMastery } from '../src/lib/statistics';

const databases: CardsDatabase[] = [];
function database(name = 'samples-' + crypto.randomUUID(), withSamples = true) {
  const db = new CardsDatabase(name, withSamples); databases.push(db); return db;
}
afterEach(async () => {
  const opened = databases.splice(0);
  for (const db of opened) db.close();
  for (const db of opened) await db.delete();
});

describe('first launch samples', () => {
  it('resets all user data to fresh samples, including images and review history', async () => {
    const db = database(); const repo = createRepository(db);
    const original = await repo.snapshot();
    const id = original.cards[0].id;
    await db.cards.update(id, { frontImage: new Blob(['image'], { type: 'image/png' }), notes: 'private note' });
    await repo.saveTag('private tag'); await repo.reviewCard(id, 'easy', 'old-review');
    await repo.resetAllData(); const reset = await repo.snapshot();
    expect(reset.cards).toHaveLength(5); expect(reset.decks).toHaveLength(1); expect(reset.tags).toHaveLength(1);
    expect(reset.reviews).toHaveLength(6);
    expect(reset.reviews.some(review => review.id === 'old-review' || original.reviews.some(old => old.id === review.id))).toBe(false);
    expect(reset.cards.map(classifyMastery)).toEqual(['mastered', 'unmastered', 'unmastered', 'unmastered', 'unlearned']);
    expect(reset.cards.every(card => !card.frontImage && !card.backImage)).toBe(true);
    expect(reset.cards.some(card => original.cards.some(old => old.id === card.id))).toBe(false);
    db.close(); await db.open(); expect(await repo.snapshot()).toEqual(reset);
    await repo.resetAllData(); expect((await repo.snapshot()).cards).toHaveLength(5);
  });
  it('retains the entire original database if sample creation during reset fails', async () => {
    const db = database(); const repo = createRepository(db); const before = await repo.snapshot();
    db.decks.hook('creating', () => { throw new Error('write failed'); });
    await expect(repo.resetAllData()).rejects.toThrow('write failed');
    expect(await repo.snapshot()).toEqual(before);
  });
  it('removes only this app’s saved deck selection and returns to all decks', () => {
    const values = new Map<string, string>([['other-app', 'keep']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    saveDeckSelection(storage, ['old-deck']); clearDeckSelection(storage);
    expect(loadDeckSelection(storage)).toBeNull(); expect([...values]).toEqual([['other-app', 'keep']]);
  });
  it('creates one mastered, three reviewing and one unlearned card with consistent history exactly once', async () => {
    const db = database(); const repo = createRepository(db);
    const first = await repo.snapshot();
    expect(first.cards).toHaveLength(5); expect(first.decks).toHaveLength(1);
    expect(first.reviews).toHaveLength(6);
    expect(first.cards.every(card => card.frontLanguage === 'en-US' && card.backLanguage === 'ja-JP')).toBe(true);
    for (const card of first.cards) {
      const history = first.reviews.filter(review => review.cardId === card.id).sort((a, b) => a.reviewedAt - b.reviewedAt);
      expect(card.reviewCount).toBe(history.length);
      expect(card.lastReviewedAt).toBe(history.at(-1)?.reviewedAt ?? null);
      if (history.length) expect(card.nextReviewAt).toBe(history.at(-1)?.nextReviewAt);
    }
    const stats = calculateStatistics(first.cards, first.reviews);
    expect(stats.mastery.map(group => [group.count, group.percent])).toEqual([[1, 20], [3, 60], [1, 20]]);
    expect(stats.today.cards).toBe(0); expect(stats.today.reviews).toBe(0);
    expect(first.cards.every(card => card.tags.every(id => first.tags.some(tag => tag.id === id)))).toBe(true);
    expect(first.decks[0]).toMatchObject({ type: 'fixed', cardIds: first.cards.map(card => card.id) });
    db.close(); await db.open(); expect(await repo.snapshot()).toEqual(first);
  });
  it('does not repopulate after deletion or empty backup restoration', async () => {
    const db = database(); const repo = createRepository(db); const first = await repo.snapshot();
    await repo.deleteCards(first.cards.map(card => card.id)); await repo.deleteDecks(first.decks.map(deck => deck.id));
    db.close(); await db.open(); expect((await repo.snapshot()).cards).toEqual([]);
    await repo.restore({ cards: [], decks: [], tags: [], reviews: [] });
    db.close(); await db.open(); expect(await repo.snapshot()).toEqual({ cards: [], decks: [], tags: [], reviews: [] });
  });
  it.each([false, true])('leaves an existing database unchanged (has card: %s)', async hasCard => {
    const existing = database(undefined, false); const repo = createRepository(existing);
    if (hasCard) await repo.saveCard({ frontText: 'existing', backText: '既存', frontImage: null, backImage: null, tags: [], notes: '' });
    const before = await repo.snapshot(); const name = existing.name; existing.close();
    const reopened = database(name); expect(await createRepository(reopened).snapshot()).toEqual(before);
  });
});
