import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Card, Deck, Review } from '../src/lib/models';
import { calculateStatistics, classifyMastery, localDateKey, selectStatisticsCards } from '../src/lib/statistics';
import { automaticCandidates, loadDeckSelection, saveDeckSelection } from '../src/lib/autoStudy';
import { createSession, DEFAULT_STUDY_OPTIONS } from '../src/lib/srs/session';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, frontText: id, backText: '裏', frontImage: null, backImage: null, tags: [], notes: '', customFields: {}, createdAt: 1, updatedAt: 1, reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0, ...extra });
const deck = (id: string, cardIds: string[]): Deck => ({ id, name: id, type: 'fixed', cardIds, createdAt: 1, updatedAt: 1, lastUsedAt: null });
const review = (id: string, cardId: string, reviewedAt: number): Review => ({ id, cardId, reviewedAt, rating: 'easy', algorithm: 'simple-v1', previousNextReviewAt: 0, nextReviewAt: 1 });

describe('local statistics', () => {
  it('distinguishes unique cards from reviews and excludes deleted cards and other dates', () => {
    const now = new Date(2026, 8, 11, 12);
    const midnight = new Date(2026, 8, 11).getTime();
    const stats = calculateStatistics([card('a'), card('b')], [review('1', 'a', midnight), review('2', 'a', midnight + 1), review('3', 'b', midnight - 1), review('4', 'deleted', midnight), review('5', 'a', new Date(2026, 8, 12).getTime())], now);
    expect(stats.today).toMatchObject({ cards: 1, reviews: 2, label: '9/11' });
    expect(stats.trend[5].cards).toBe(1);
    expect(stats.trend[0].cards).toBe(0);
    expect(localDateKey(new Date(midnight))).toBe('2026-9-11');
  });
  it('uses calendar days over month/year and daylight-saving boundaries', () => {
    expect(calculateStatistics([], [], new Date(2026, 0, 2)).trend.map(day => day.label)).toEqual(['12/27', '12/28', '12/29', '12/30', '12/31', '1/1', '1/2']);
    expect(new Set(calculateStatistics([], [], new Date(2026, 2, 10)).trend.map(day => day.key)).size).toBe(7);
  });
  it('classifies accumulated learning data and handles empty populations without NaN', () => {
    expect(classifyMastery(card('new'))).toBe('unlearned');
    expect(classifyMastery(card('weak', { reviewCount: 5, difficulty: 8, stability: 6, masteryLevel: 4 }))).toBe('unmastered');
    expect(classifyMastery(card('easy-once', { reviewCount: 1, stability: 1, masteryLevel: 1, difficulty: 4.4 }))).toBe('unmastered');
    const mastered = card('mastered', { reviewCount: 3, stability: 5.76, masteryLevel: 3, difficulty: 3.2 });
    expect(classifyMastery(mastered)).toBe('mastered');
    const mixed = calculateStatistics([mastered, card('new'), card('again', { reviewCount: 2, difficulty: 7 }), card('hard', { reviewCount: 1, stability: 0.1 })], []);
    expect(mixed.mastery).toEqual([
      { key: 'mastered', count: 1, percent: 25 },
      { key: 'unmastered', count: 2, percent: 50 },
      { key: 'unlearned', count: 1, percent: 25 },
    ]);
    expect(calculateStatistics([mastered, card('new')], []).mastery.find(group => group.key === 'mastered')?.percent).toBe(50);
    expect(calculateStatistics([], []).mastery.every(group => group.count === 0 && group.percent === 0)).toBe(true);
  });
  it('reflects real database import, ratings, deletion, history reset and restore', async () => {
    const db = new CardsDatabase(`statistics-${crypto.randomUUID()}`);
    const repo = createRepository(db);
    try {
      await repo.importTextCards([{ frontText: 'a', backText: 'A', tagNames: [], notes: '' }, { frontText: 'b', backText: 'B', tagNames: [], notes: '' }]);
      const before = await repo.snapshot();
      await repo.reviewCard(before.cards[0].id, 'easy', 'r1');
      await repo.reviewCard(before.cards[0].id, 'hard', 'r2');
      const saved = await repo.snapshot();
      expect(calculateStatistics(saved.cards, saved.reviews).today).toMatchObject({ cards: 1, reviews: 2 });
      await repo.deleteCard(before.cards[0].id);
      let data = await repo.snapshot();
      expect(calculateStatistics(data.cards, data.reviews)).toMatchObject({ total: 1, today: { cards: 0, reviews: 0 } });
      await repo.restore(saved);
      data = await repo.snapshot();
      expect(calculateStatistics(data.cards, data.reviews)).toMatchObject({ total: 2, today: { cards: 1, reviews: 2 } });
      await repo.clearLearningHistory();
      data = await repo.snapshot();
      expect(calculateStatistics(data.cards, data.reviews)).toMatchObject({ total: 2, today: { cards: 0, reviews: 0 } });
    } finally { await db.delete(); }
  });
});
describe('automatic learning', () => {
  it('unions selected memberships without orphan/duplicate cards; never includes unassigned cards', () => {
    const cards = ['a', 'b', 'c', 'unassigned'].map(id => card(id));
    const decks = [deck('one', ['a', 'b', 'missing']), deck('two', ['b', 'c'])];
    expect(automaticCandidates(cards, decks, null).map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(automaticCandidates(cards, decks, ['two']).map(c => c.id)).toEqual(['b', 'c']);
    expect(automaticCandidates(cards, decks, [])).toEqual([]);
    expect(automaticCandidates(cards, decks, ['deleted'])).toEqual([]);
  });
  it('persists all/none/explicit choices and reports write failures', () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, data: string) => { value = data; } };
    expect(loadDeckSelection(storage)).toBeNull();
    for (const selection of [[], ['one'], null]) { saveDeckSelection(storage, selection); expect(loadDeckSelection(storage)).toEqual(selection); }
    value = '{'; expect(() => loadDeckSelection(storage)).toThrow();
    expect(() => saveDeckSelection({ setItem: () => { throw new Error('quota'); } }, [])).toThrow();
  });
  it('separates SRS modes from full review, prioritizes and never repeats cards', () => {
    const now = Date.now();
    const cards = [card('future', { reviewCount: 10, nextReviewAt: now + 1 }), card('due', { reviewCount: 1, nextReviewAt: now }), card('new', { nextReviewAt: now + 100 })];
    for (const mode of ['automatic', 'deck'] as const) expect(createSession(cards, [], { ...DEFAULT_STUDY_OPTIONS, mode }, now).queue.map(item => item.card.id).sort()).toEqual(['due', 'new']);
    expect(createSession(cards, [], { ...DEFAULT_STUDY_OPTIONS, mode: 'full' }, now).initialCount).toBe(3);
    expect(createSession([...cards, cards[1]], [], { ...DEFAULT_STUDY_OPTIONS, mode: 'automatic' }, now).initialCount).toBe(2);
    expect(createSession(cards.slice(0, 1), [], { ...DEFAULT_STUDY_OPTIONS, mode: 'deck' }, now).initialCount).toBe(0);
  });
});

describe('statistics scopes', () => {
  const cards = [card('a', { tags: ['english', 'weak'] }), card('b', { tags: ['english'] }), card('c', { tags: ['network'] }), card('d')];
  const decks = [deck('english', ['a', 'b', 'a', 'missing']), deck('mixed', ['a', 'c'])];
  it('selects current deck members once and handles deleted or unselected decks', () => {
    expect(selectStatisticsCards(cards, decks, { kind: 'all' })).toBe(cards);
    expect(selectStatisticsCards(cards, decks, { kind: 'deck', deckId: 'english' }).map(c => c.id)).toEqual(['a', 'b']);
    expect(selectStatisticsCards(cards, decks, { kind: 'deck', deckId: 'deleted' })).toEqual([]);
    expect(selectStatisticsCards(cards, decks, { kind: 'deck', deckId: '' })).toEqual([]);
  });
  it('combines selected tags with AND/OR without duplicate counts and has explicit empty selection', () => {
    expect(selectStatisticsCards(cards, decks, { kind: 'tags', tagIds: ['english', 'weak'], match: 'all' }).map(c => c.id)).toEqual(['a']);
    expect(selectStatisticsCards(cards, decks, { kind: 'tags', tagIds: ['english', 'weak'], match: 'any' }).map(c => c.id)).toEqual(['a', 'b']);
    expect(selectStatisticsCards(cards, decks, { kind: 'tags', tagIds: [], match: 'all' })).toEqual([]);
    expect(selectStatisticsCards(cards, decks, { kind: 'tags', tagIds: ['deleted'], match: 'any' })).toEqual([]);
    expect(selectStatisticsCards(cards, decks, { kind: 'tags', tagIds: ['english', 'network'], match: 'all' })).toEqual([]);
  });
  it('applies the same scope to totals, unique counts, review counts, mastery and trend', () => {
    const now = new Date(2026, 8, 11, 12);
    const selected = selectStatisticsCards(cards, decks, { kind: 'deck', deckId: 'english' });
    const statistics = calculateStatistics(selected, [review('1', 'a', +now), review('2', 'a', +now), review('3', 'c', +now)], now);
    expect(statistics).toMatchObject({ total: 2, today: { cards: 1, reviews: 2 } });
    expect(statistics.mastery.find(group => group.key === 'unlearned')).toMatchObject({ count: 2, percent: 100 });
    expect(statistics.trend[6].cards).toBe(1);
    const changed = cards.map(c => ({ ...c, tags: [] }));
    expect(selectStatisticsCards(changed, decks, { kind: 'tags', tagIds: ['english'], match: 'all' })).toEqual([]);
    expect(selectStatisticsCards(cards, [deck('english', ['b'])], { kind: 'deck', deckId: 'english' }).map(c => c.id)).toEqual(['b']);
  });
});
