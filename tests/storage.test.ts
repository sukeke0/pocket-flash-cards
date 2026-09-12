import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import { cardsInDeck } from '../src/lib/decks';
import { exportBackup, readBackup } from '../src/lib/transfer/backup';
import { strToU8, zipSync } from 'fflate';
import type { CardInput, Deck } from '../src/lib/models';

let database: CardsDatabase;
let repo: ReturnType<typeof createRepository>;
const input: CardInput = { frontText: 'ubiquitous', backText: '至るところにある', frontImage: null, backImage: null, tags: [], notes: '例文' };
const deckBase = { id: 'deck', name: '英検準1級', createdAt: 1, updatedAt: 1, lastUsedAt: null };
beforeEach(() => { database = new CardsDatabase(`test-${crypto.randomUUID()}`); repo = createRepository(database); });
afterEach(async () => { await database.delete(); });

describe('IndexedDB repository', () => {
  it('clears history and resets learning fields while retaining card content, images, tags and decks', async () => {
    const tag = await repo.saveTag('保持');
    const id = await repo.saveCard({ ...input, frontImage: new Blob(['image'], { type: 'image/png' }), tags: [tag] });
    await repo.saveDeck({ ...deckBase, type: 'fixed', cardIds: [id] });
    await repo.reviewCard(id, 'easy', 'review');
    const before = await repo.snapshot();
    await repo.clearLearningHistory();
    const after = await repo.snapshot();
    expect(after).toEqual({ ...before, reviews: [], cards: before.cards.map(card => ({ ...card, reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0 })) });
    expect(await after.cards[0].frontImage!.text()).toBe('image');
    await repo.clearLearningHistory();
    expect(await repo.snapshot()).toEqual(after);
  });
  it('rolls back history deletion when resetting card learning fields fails', async () => {
    const id = await repo.saveCard(input);
    await repo.reviewCard(id, 'hard', 'review');
    const before = await repo.snapshot();
    database.cards.hook('updating', () => { throw new Error('Simulated failure'); });
    await expect(repo.clearLearningHistory()).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
  });
  it('persists text, image Blob and tags across reopening; edits preserve SRS data', async () => {
    const tagId = await repo.saveTag('形容詞');
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const id = await repo.saveCard({ ...input, frontImage: image, tags: [tagId, tagId] });
    await database.cards.update(id, { reviewCount: 7, stability: 8 });
    database.close(); await database.open();
    const saved = (await repo.snapshot()).cards[0];
    expect(saved.tags).toEqual([tagId]);
    expect(saved.frontImage).toBeInstanceOf(Blob);
    expect(new Uint8Array(await saved.frontImage!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await repo.saveCard({ ...input, frontText: 'edited', tags: [tagId], frontImage: image }, id);
    expect((await repo.snapshot()).cards[0]).toMatchObject({ id, frontText: 'edited', reviewCount: 7, stability: 8, createdAt: saved.createdAt });
  });
  it('renames and deletes tags without changing the saved deck membership', async () => {
    const tagId = await repo.saveTag('英単語');
    const cardId = await repo.saveCard({ ...input, tags: [tagId] });
    await repo.saveTag('英語', tagId);
    await repo.saveDeck({ ...deckBase, type: 'dynamic', match: 'all', conditions: [{ field: 'tag', value: tagId }] });
    await repo.deleteTag(tagId);
    expect((await repo.snapshot()).cards[0].tags).toEqual([]);
    expect((await repo.snapshot()).decks[0]).toMatchObject({ type: 'fixed', cardIds: [cardId] });
  });
  it('removes deleted card references from fixed decks and review history atomically', async () => {
    const id = await repo.saveCard(input);
    await repo.saveDeck({ ...deckBase, type: 'fixed', cardIds: [id] });
    await database.reviews.add({ id: 'r', cardId: id, rating: 'easy', reviewedAt: 1, previousNextReviewAt: 1, nextReviewAt: 2, algorithm: 'test' });
    await repo.deleteCard(id);
    const snapshot = await repo.snapshot();
    expect(snapshot.cards).toHaveLength(0); expect(snapshot.reviews).toHaveLength(0);
    expect(snapshot.decks[0]).toMatchObject({ cardIds: [] });
  });
  it('rolls back the entire restore if a write fails', async () => {
    await repo.saveCard(input);
    const snapshot = await repo.snapshot();
    await expect(repo.restore({ ...snapshot, tags: [{ id: '1', name: 'same', createdAt: 1, updatedAt: 1 }, { id: '2', name: 'same', createdAt: 1, updatedAt: 1 }] })).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(snapshot);
  });
  it('rejects empty cards and stale tag/card references', async () => {
    await expect(repo.saveCard({ ...input, frontText: '' })).rejects.toThrow('表面');
    await expect(repo.saveCard({ ...input, tags: ['missing'] })).rejects.toThrow('タグ');
    await expect(repo.saveCard(input, 'missing')).rejects.toThrow('削除');
    expect((await repo.snapshot()).cards).toHaveLength(0);
  });
});

describe('deck conditions', () => {
  it('supports AND, OR, fixed membership and future numeric/unlearned conditions', async () => {
    const a = await repo.saveTag('英検準1級'); const b = await repo.saveTag('苦手');
    const first = await repo.saveCard({ ...input, tags: [a, b] });
    await repo.saveCard({ ...input, tags: [a] });
    const { cards } = await repo.snapshot();
    const deck: Deck = { ...deckBase, type: 'dynamic', match: 'all', conditions: [{ field: 'tag', value: a }, { field: 'tag', value: b }] };
    expect(cardsInDeck(cards, deck).map(c => c.id)).toEqual([first]);
    expect(cardsInDeck(cards, { ...deck, match: 'any' })).toHaveLength(2);
    expect(cardsInDeck(cards, { ...deckBase, type: 'fixed', cardIds: [first] })).toHaveLength(1);
    expect(cardsInDeck(cards, { ...deck, conditions: [{ field: 'unlearned', value: true }, { field: 'reviewCount', operator: 'lte', value: 0 }] })).toHaveLength(2);
    expect(cardsInDeck(cards, { ...deck, conditions: [{ field: 'lastReviewedAt', operator: 'lte', value: Date.now() }] })).toHaveLength(0);
  });
});

describe('portable ZIP backup', () => {
  it('roundtrips both images, Japanese content, tags, decks and history into a clean DB', async () => {
    const tag = await repo.saveTag('英検準1級');
    const image = new Blob([new Uint8Array([8, 3, 4])], { type: 'image/png' });
    const cardId = await repo.saveCard({ ...input, frontImage: image, backImage: image, tags: [tag] });
    await repo.saveDeck({ ...deckBase, type: 'fixed', cardIds: [cardId] });
    await database.reviews.add({ id: 'history', cardId, rating: 'hard', reviewedAt: 1, previousNextReviewAt: 0, nextReviewAt: 100, algorithm: 'test' });
    const original = await repo.snapshot();
    const file = await exportBackup(original);
    const restored = await readBackup(file);
    await repo.deleteCard(cardId); await repo.restore(restored);
    const result = await repo.snapshot();
    expect(result.cards[0]).toMatchObject({ ...input, id: cardId, tags: [tag], frontImage: expect.any(Blob), backImage: expect.any(Blob) });
    expect(await result.cards[0].backImage!.arrayBuffer()).toEqual(await image.arrayBuffer());
    expect(result.decks).toEqual(original.decks); expect(result.reviews).toEqual(original.reviews);
  });
  it.each([
    [{ schemaVersion: 999 }, 'schemaVersion'],
    [{ schemaVersion: 1, cards: [], tags: [], decks: [{ ...deckBase, type: 'fixed', cardIds: ['missing'] }] }, '参照先'],
    [{ schemaVersion: 1, cards: [], tags: [{ id: 'a', name: 'a', createdAt: 1, updatedAt: 1 }, { id: 'a', name: 'b', createdAt: 1, updatedAt: 1 }], decks: [] }, '重複'],
  ])('rejects invalid data without modifying existing records', async (data, reason) => {
    await repo.saveCard(input); const before = await repo.snapshot();
    const zipped = zipSync({ 'data.json': strToU8(JSON.stringify(data)) });
    await expect(readBackup(new Blob([new Uint8Array(zipped)]))).rejects.toThrow(reason);
    expect(await repo.snapshot()).toEqual(before);
  });
  it('rejects malformed ZIPs and missing image files', async () => {
    await expect(readBackup(new Blob(['broken']))).rejects.toThrow('ZIP');
    await repo.saveCard(input);
    const data = await repo.snapshot();
    const invalid = { schemaVersion: 1, ...data, cards: [{ ...data.cards[0], frontImage: 'images/lost.png' }] };
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify(invalid)) });
    await expect(readBackup(new Blob([new Uint8Array(zip)]))).rejects.toThrow('画像が見つかりません');
  });
});
