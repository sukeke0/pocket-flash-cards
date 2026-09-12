import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import type { CardInput } from '../src/lib/models';

let db: CardsDatabase;
let repo: ReturnType<typeof createRepository>;
let ids: string[];
const input: CardInput = { frontText: 'front', backText: 'back', tags: [], notes: '', frontImage: new Blob(['image'], { type: 'image/png' }), backImage: null };
beforeEach(async () => {
  db = new CardsDatabase(`bulk-${crypto.randomUUID()}`); repo = createRepository(db);
  const tag = await repo.saveTag('keep');
  ids = [];
  for (let i = 0; i < 3; i++) ids.push(await repo.saveCard({ ...input, tags: [tag], frontText: String(i) }));
  for (const id of ids) await repo.reviewCard(id, 'easy', `review-${id}`, 100);
  for (const id of ['one', 'two', 'keep']) await repo.saveDeck({ id, name: id, type: 'fixed', cardIds: [...ids], createdAt: 1, updatedAt: 1, lastUsedAt: null });
});
afterEach(async () => { await db.delete(); });

describe('atomic bulk deletion', () => {
  it('deletes selected cards and images, removes their history and memberships, and keeps everything else', async () => {
    const before = await repo.snapshot();
    expect(await repo.deleteCards([ids[0], ids[1], ids[0], 'missing'])).toBe(2);
    const after = await repo.snapshot();
    expect(after.cards).toEqual(before.cards.filter(card => card.id === ids[2]));
    expect(after.reviews).toEqual(before.reviews.filter(review => review.cardId === ids[2]));
    expect(after.tags).toEqual(before.tags);
    expect(after.decks).toHaveLength(3);
    for (const deck of after.decks) expect(deck).toMatchObject({ cardIds: [ids[2]] });
    expect(await repo.deleteCards([ids[0], ids[1]])).toBe(0);
    expect(await repo.deleteCards([])).toBe(0);
  });
  it('rolls back card, history and membership changes if any part fails', async () => {
    const before = await repo.snapshot();
    db.decks.hook('updating', () => { throw new Error('simulated failure'); });
    await expect(repo.deleteCards(ids.slice(0, 2))).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
  });
  it('deletes only selected decks and preserves shared cards, images, tags and history', async () => {
    const before = await repo.snapshot();
    expect(await repo.deleteDecks(['one', 'two', 'one', 'missing'])).toBe(2);
    const after = await repo.snapshot();
    expect(after.decks).toEqual(before.decks.filter(deck => deck.id === 'keep'));
    expect(after.cards).toEqual(before.cards); expect(after.reviews).toEqual(before.reviews); expect(after.tags).toEqual(before.tags);
    expect(await repo.deleteDecks([])).toBe(0);
  });
  it('rolls back all selected decks when a deletion fails', async () => {
    const before = await repo.snapshot();
    db.decks.hook('deleting', id => { if (id === 'two') throw new Error('simulated failure'); });
    await expect(repo.deleteDecks(['one', 'two'])).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
  });
});
