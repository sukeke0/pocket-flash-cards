import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import { cardsInDeck, cardsWithoutDeck, filterDeckCards, materializeDeck, selectedDeckCardIds, toggleDeckCardSelection } from '../src/lib/decks';
import { exportBackup, readBackup } from '../src/lib/transfer/backup';
import type { Card, CardInput, Deck, Tag } from '../src/lib/models';

let db: CardsDatabase;
let repo: ReturnType<typeof createRepository>;
const base = { id: 'deck', name: 'まとめ', createdAt: 1, updatedAt: 2, lastUsedAt: 3 };
const input: CardInput = { frontText: 'apple', backText: 'りんご', tags: [], notes: '', frontImage: null, backImage: null };
beforeEach(() => { db = new CardsDatabase(`decks-${crypto.randomUUID()}`); repo = createRepository(db); });
afterEach(async () => { await db.delete(); });

describe('deck selection and compatibility', () => {
  it('updates automatic selection as conditions narrow or clear without losing manual cards', () => {
    const choices = { manualIds: ['existing', 'manual'], omittedIds: [] };
    expect(selectedDeckCardIds(choices, [])).toEqual(['existing', 'manual']);
    expect(selectedDeckCardIds(choices, ['regular', 'trainee', 'manual'])).toEqual(['existing', 'manual', 'regular', 'trainee']);
    // Adding an exclusion removes a previously auto-selected card immediately.
    expect(selectedDeckCardIds(choices, ['regular'])).toEqual(['existing', 'manual', 'regular']);
    expect(selectedDeckCardIds(choices, [])).toEqual(['existing', 'manual']);
  });
  it('keeps individual deselection across condition changes and allows selecting it again', () => {
    const initial = { manualIds: ['existing'], omittedIds: [] };
    const removed = toggleDeckCardSelection(initial, ['auto', 'other'], 'auto');
    expect(selectedDeckCardIds(removed, ['auto', 'other', 'new'])).toEqual(['existing', 'other', 'new']);
    const restored = toggleDeckCardSelection(removed, ['auto', 'other'], 'auto');
    expect(selectedDeckCardIds(restored, ['auto', 'other'])).toEqual(['existing', 'auto', 'other']);
    // An explicit manual selection remains when the tag condition is cleared.
    expect(selectedDeckCardIds(restored, [])).toEqual(['existing', 'auto']);
  });
  it('removes a saved deck card even when the current automatic condition also matches it', () => {
    const initial = { manualIds: ['existing', 'other'], omittedIds: [] };
    const removed = toggleDeckCardSelection(initial, ['existing', 'auto'], 'existing');
    expect(selectedDeckCardIds(removed, ['existing', 'auto'])).toEqual(['other', 'auto']);
    expect(selectedDeckCardIds(removed, [])).toEqual(['other']);
  });
  it('finds unassigned cards across overlapping decks and follows assignment, deletion and restore', async () => {
    const a = await repo.saveCard(input);
    const b = await repo.saveCard({ ...input, frontText: 'b' });
    const c = await repo.saveCard({ ...input, frontText: 'c' });
    let data = await repo.snapshot();
    expect(cardsWithoutDeck(data.cards, [])).toHaveLength(3);
    await repo.saveDeck({ ...base, type: 'fixed', cardIds: [a, b] });
    await repo.saveDeck({ ...base, id: 'other', type: 'fixed', cardIds: [b] });
    const saved = await repo.snapshot();
    expect(cardsWithoutDeck(saved.cards, saved.decks).map(card => card.id)).toEqual([c]);
    await repo.deleteDecks([base.id]);
    data = await repo.snapshot();
    expect(cardsWithoutDeck(data.cards, data.decks).map(card => card.id).sort()).toEqual([a, c].sort());
    await repo.deleteCard(c);
    data = await repo.snapshot();
    expect(cardsWithoutDeck(data.cards, data.decks).map(card => card.id)).toEqual([a]);
    await repo.restore(saved);
    data = await repo.snapshot();
    expect(cardsWithoutDeck(data.cards, data.decks).map(card => card.id)).toEqual([c]);
    await repo.saveDeck({ ...base, id: 'other', type: 'fixed', cardIds: [b, c] });
    data = await repo.snapshot();
    expect(cardsWithoutDeck(data.cards, data.decks)).toEqual([]);
  });
  it('handles empty input, repeated/stale memberships and legacy conditions', async () => {
    const id = await repo.saveCard(input);
    const cards = (await repo.snapshot()).cards;
    expect(cardsWithoutDeck([], [])).toEqual([]);
    expect(cardsWithoutDeck(cards, [{ ...base, type: 'fixed', cardIds: ['missing'] }])).toEqual(cards);
    expect(cardsWithoutDeck(cards, [{ ...base, type: 'fixed', cardIds: [id, id, 'missing'] }])).toEqual([]);
    expect(cardsWithoutDeck(cards, [{ ...base, type: 'dynamic', match: 'all', conditions: [{ field: 'unlearned', value: true }] }])).toEqual([]);
  });
  it('preserves deck addition order regardless of card edits or DB listing order', async () => {
    const first = await repo.saveCard(input);
    const second = await repo.saveCard({ ...input, frontText: 'second' });
    const cards = (await repo.snapshot()).cards;
    const deck: Deck = { ...base, type: 'fixed', cardIds: [second, first] };
    expect(cardsInDeck(cards, deck).map(card => card.id)).toEqual([second, first]);
    expect(cardsInDeck([...cards].reverse(), deck).map(card => card.id)).toEqual([second, first]);
  });
  it('finds a card beyond the first 1,000 using normalized keywords and intersecting tags', async () => {
    const id = await repo.saveCard(input);
    const template = (await db.cards.get(id))!;
    const cards: Card[] = Array.from({ length: 1200 }, (_, index) => ({ ...template, id: String(index), frontText: `word ${index}` }));
    const target = { ...template, id: 'target', frontText: 'ＲＦＣ Network', backText: '通信の約束', notes: 'important', tags: ['a', 'b'] };
    cards.push(target);
    const tags: Tag[] = [{ id: 'a', name: '英語', createdAt: 1, updatedAt: 1 }, { id: 'b', name: '苦手', createdAt: 1, updatedAt: 1 }];
    expect(filterDeckCards(cards, tags, 'rfc 通信 important 英語', ['a', 'b'])).toEqual([target]);
    expect(filterDeckCards(cards, tags, 'ＲＦＣ', ['missing'])).toEqual([]);
    expect(filterDeckCards(cards, tags, '  ', [])).toHaveLength(1201);
    expect(filterDeckCards(cards, tags, '', ['a', 'missing'], 'any')).toEqual([target]);
  });

  it('stores only unique card IDs, preserving them after retagging, deleting tags and adding new cards', async () => {
    const tag = await repo.saveTag('英語');
    const id = await repo.saveCard({ ...input, tags: [tag] });
    const cards = (await repo.snapshot()).cards;
    const selected = filterDeckCards(cards, (await repo.snapshot()).tags, '', [tag]).map(card => card.id);
    await repo.saveDeck({ ...base, type: 'fixed', cardIds: [...selected, id] });
    await repo.saveCard({ ...input, tags: [] }, id);
    await repo.saveCard({ ...input, frontText: 'new', tags: [tag] });
    await repo.deleteTag(tag);
    expect(await db.decks.get(base.id)).toEqual({ ...base, updatedAt: expect.any(Number), type: 'fixed', cardIds: [id] });
  });

  it.each([
    { label: 'AND with exclusion', included: ['bay', 'pitcher'], excluded: ['development'], match: 'all' as const, query: '', expected: ['pitcher'] },
    { label: 'OR with exclusion', included: ['bay', 'catcher'], excluded: ['development'], match: 'any' as const, query: '', expected: ['pitcher', 'fielder', 'catcher'] },
    { label: 'any excluded tag is sufficient', included: ['bay'], excluded: ['development', 'pitcher'], match: 'all' as const, query: '', expected: ['fielder'] },
    { label: 'exclusion without inclusion', included: [], excluded: ['development'], match: 'any' as const, query: '', expected: ['pitcher', 'fielder', 'catcher', 'untagged'] },
    { label: 'exclusion wins over the same included tag', included: ['bay'], excluded: ['bay'], match: 'all' as const, query: '', expected: [] },
    { label: 'keywords combine with OR and exclusion', included: ['bay', 'catcher'], excluded: ['development'], match: 'any' as const, query: '横浜 野手', expected: ['fielder'] },
    { label: 'cleared filters restore every candidate', included: [], excluded: [], match: 'all' as const, query: '', expected: ['pitcher', 'fielder', 'trainee', 'catcher', 'untagged'] },
  ])('$label', async ({ included, excluded, match, query, expected }) => {
    const id = await repo.saveCard(input);
    const template = (await db.cards.get(id))!;
    const cards: Card[] = [
      { ...template, id: 'pitcher', frontText: '投手', tags: ['bay', 'pitcher'] },
      { ...template, id: 'fielder', frontText: '野手', tags: ['bay'] },
      { ...template, id: 'trainee', frontText: '育成投手', tags: ['bay', 'pitcher', 'development'] },
      { ...template, id: 'catcher', frontText: '捕手', tags: ['catcher'] },
      { ...template, id: 'untagged', tags: [] },
    ];
    const tags: Tag[] = [{ id: 'bay', name: '横浜ベイスターズ', createdAt: 1, updatedAt: 1 }];
    expect(filterDeckCards(cards, tags, query, included, match, excluded).map(card => card.id)).toEqual(expected);
  });

  it('upgrades a real v1 database atomically, retaining existing memberships and metadata', async () => {
    const tagId = await repo.saveTag('英語');
    const cardId = await repo.saveCard({ ...input, tags: [tagId] });
    const snapshot = await repo.snapshot();
    const name = db.name;
    await db.delete();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ cards: 'id, *tags, createdAt, updatedAt, nextReviewAt, reviewCount', tags: 'id, &name', decks: 'id, type, updatedAt, lastUsedAt', reviews: 'id, cardId, reviewedAt, [cardId+reviewedAt]' });
    await legacy.table('cards').bulkAdd(snapshot.cards);
    await legacy.table('tags').bulkAdd(snapshot.tags);
    await legacy.table('decks').bulkAdd([
      { ...base, type: 'dynamic', match: 'all', conditions: [{ field: 'tag', value: tagId }] },
      { ...base, id: 'fixed', type: 'fixed', cardIds: [cardId] },
      { ...base, id: 'empty', type: 'dynamic', match: 'any', conditions: [] },
    ]);
    legacy.close();
    db = new CardsDatabase(name); repo = createRepository(db);
    expect((await repo.snapshot()).cards).toEqual(snapshot.cards);
    expect(await db.decks.get('deck')).toEqual({ ...base, type: 'fixed', cardIds: [cardId] });
    expect(await db.decks.get('fixed')).toEqual({ ...base, id: 'fixed', type: 'fixed', cardIds: [cardId] });
    expect(await db.decks.get('empty')).toEqual({ ...base, id: 'empty', type: 'fixed', cardIds: [] });
    await repo.saveCard({ ...input, tags: [tagId] });
    expect((await db.decks.get('deck'))).toMatchObject({ cardIds: [cardId] });
  });

  it('restores legacy ZIP conditions as membership, allowing later manual edits', async () => {
    const tag = await repo.saveTag('英語');
    const id = await repo.saveCard({ ...input, tags: [tag] });
    const manualId = await repo.saveCard({ ...input, frontText: 'manual' });
    const snapshot = await repo.snapshot();
    const legacy: Deck = { ...base, type: 'dynamic', match: 'all', conditions: [{ field: 'tag', value: tag }] };
    const archive = await exportBackup({ ...snapshot, decks: [legacy] });
    await repo.restore(await readBackup(archive));
    const restored = (await db.decks.get('deck'))!;
    expect(restored).toEqual({ ...base, type: 'fixed', cardIds: [id] });
    await repo.saveDeck({ ...materializeDeck(restored, snapshot.cards), cardIds: [id, manualId] });
    await repo.deleteTag(tag);
    expect((await db.decks.get('deck'))).toMatchObject({ cardIds: [id, manualId] });
    expect((await readBackup(await exportBackup(await repo.snapshot()))).decks).toEqual((await repo.snapshot()).decks);
  });

  it('rejects deleted card references without replacing existing deck contents', async () => {
    const id = await repo.saveCard(input);
    await repo.saveDeck({ ...base, type: 'fixed', cardIds: [id] });
    const saved = await db.decks.get(base.id);
    await expect(repo.saveDeck({ ...base, type: 'fixed', cardIds: [id, 'deleted'] })).rejects.toThrow('存在しないカード');
    expect(await db.decks.get(base.id)).toEqual(saved);
  });
});
