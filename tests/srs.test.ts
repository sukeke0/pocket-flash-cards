import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card, Review } from '../src/lib/models';
import { simpleScheduler, DAY } from '../src/lib/srs/simple';
import { createSession, advanceSession, DEFAULT_STUDY_OPTIONS, eligibleStudyCards, planStudyStart } from '../src/lib/srs/session';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';

const now = 100 * DAY;
const card = (id = 'a', changes: Partial<Card> = {}): Card => ({
  id, frontText: id, backText: 'answer', frontImage: null, backImage: null,
  tags: [], notes: '', customFields: {}, createdAt: 1, updatedAt: 1,
  reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0,
  ...changes,
});

describe('simple scheduler', () => {
  it('schedules again in a minute, hard in ten minutes, and easy at least a day later', () => {
    expect(simpleScheduler.schedule(card(), 'again', now).nextReviewAt).toBe(now + 60_000);
    expect(simpleScheduler.schedule(card(), 'hard', now).nextReviewAt).toBe(now + 600_000);
    expect(simpleScheduler.schedule(card(), 'easy', now).nextReviewAt).toBe(now + DAY);
  });
  it('lengthens easy intervals, lowers stability for failures and bounds numeric fields', () => {
    const known = card('a', { stability: 20, reviewCount: 8, masteryLevel: 5, difficulty: 1 });
    expect(simpleScheduler.schedule(known, 'easy', now)).toMatchObject({ stability: 48, masteryLevel: 5, difficulty: 1, reviewCount: 9, lastReviewedAt: now });
    expect(simpleScheduler.schedule(known, 'again', now).stability).toBeLessThan(20);
    expect(simpleScheduler.schedule(card('a', { difficulty: 10 }), 'again', now)).toMatchObject({ difficulty: 10, masteryLevel: 0 });
    expect(simpleScheduler.schedule(card('a', { stability: 365 }), 'easy', now).nextReviewAt).toBe(now + 365 * DAY);
  });
});
describe('session queue', () => {
  it.each(['again', 'hard'] as const)('repeats %s once at the end with a fresh review ID', rating => {
    const initial = createSession([card('a'), card('b')], [], DEFAULT_STUDY_OPTIONS, now);
    const options = { rating, repeatAgain: rating === 'again', repeatHard: rating === 'hard' };
    let session = advanceSession(initial, card('a'), options);
    expect(session.queue.map(item => item.card.id)).toEqual(['b', 'a']);
    expect(session.queue[1].reviewId).not.toBe(initial.queue[0].reviewId);
    session = advanceSession(session, card('b'));
    session = advanceSession(session, card('a'), options);
    expect(session.queue).toEqual([]); expect(session.completed).toBe(3); expect(session.initialCount).toBe(2);
    expect(initial.queue).toHaveLength(2);
  });
  it('does not repeat easy ratings, skipped cards, or disabled ratings', () => {
    const initial = createSession([card()], [], DEFAULT_STUDY_OPTIONS, now);
    expect(advanceSession(initial, card(), { rating: 'easy', repeatAgain: true, repeatHard: true }).queue).toEqual([]);
    expect(advanceSession(initial, card()).queue).toEqual([]);
    expect(advanceSession(initial, card(), { rating: 'hard', repeatAgain: true, repeatHard: false }).queue).toEqual([]);
  });
  it.each(['automatic', 'deck'] as const)('allows %s study after reviews are complete without changing SRS data', mode => {
    const cards = [card('a', { reviewCount: 3, nextReviewAt: now + DAY }), card('b', { reviewCount: 2, nextReviewAt: now + 2 * DAY })];
    const before = structuredClone(cards);
    const plan = planStudyStart(cards, [], { ...DEFAULT_STUDY_OPTIONS, mode, reverse: true }, now);
    expect(plan.count).toBe(2); expect(plan.notice).toContain('今日の復習は終わっています');
    expect(plan.options).toMatchObject({ mode, reverse: true, includeScheduled: true });
    expect(createSession(cards, [], plan.options, now).initialCount).toBe(2);
    expect(cards).toEqual(before);
  });
  it('returns to due cards when reconfiguring a previously extended session', () => {
    const cards = [card('due'), card('later', { reviewCount: 1, nextReviewAt: now + DAY })];
    const plan = planStudyStart(cards, [], { ...DEFAULT_STUDY_OPTIONS, mode: 'deck', includeScheduled: true }, now);
    expect(plan.count).toBe(1); expect(plan.notice).toBe(''); expect(plan.options.includeScheduled).toBe(false);
  });
  it.each(['automatic', 'deck', 'full'] as const)('relaxes easy exclusion if it would prevent all %s study', mode => {
    const cards = [card('a', { reviewCount: 1, nextReviewAt: now + DAY })];
    const history: Review[] = [{ id: 'r', cardId: 'a', rating: 'easy', reviewedAt: now - DAY, algorithm: 'test', previousNextReviewAt: 0, nextReviewAt: now + DAY }];
    const plan = planStudyStart(cards, history, { ...DEFAULT_STUDY_OPTIONS, mode, excludeEasy: true }, now);
    expect(plan.count).toBe(1); expect(plan.options.excludeEasy).toBe(false); expect(plan.notice).toContain('今回は「余裕」のカードも含め');
    expect(createSession(cards, history, plan.options, now).initialCount).toBe(1);
  });
  it('keeps easy exclusion when other cards are available', () => {
    const cards = [card('easy'), card('new')];
    const history: Review[] = [{ id: 'r', cardId: 'easy', rating: 'easy', reviewedAt: now, algorithm: 'test', previousNextReviewAt: 0, nextReviewAt: now }];
    const plan = planStudyStart(cards, history, { ...DEFAULT_STUDY_OPTIONS, mode: 'deck', excludeEasy: true }, now);
    expect(plan.count).toBe(1); expect(plan.options.excludeEasy).toBe(true); expect(plan.notice).toBe('');
  });
  it('does not invent cards for an empty deck', () => {
    const plan = planStudyStart([], [], { ...DEFAULT_STUDY_OPTIONS, mode: 'deck' }, now);
    expect(plan.count).toBe(0); expect(plan.notice).toBe('');
  });
  it('uses deck order and includes future cards by default without mutating the source', () => {
    const cards = [card('z', { reviewCount: 3, nextReviewAt: now + DAY }), card('a'), card('c')];
    expect(createSession(cards, [], DEFAULT_STUDY_OPTIONS, now).queue.map(item => item.card.id)).toEqual(['z', 'a', 'c']);
    expect(cards.map(item => item.id)).toEqual(['z', 'a', 'c']);
  });
  it('excludes only latest easy ratings, regardless of history order or mastery', () => {
    const review = (id: string, cardId: string, rating: Review['rating'], reviewedAt: number): Review => ({ id, cardId, rating, reviewedAt, algorithm: 'test', previousNextReviewAt: 0, nextReviewAt: 1 });
    const cards = [card('easy'), card('again', { masteryLevel: 5 }), card('hard'), card('new')];
    const history = [review('1', 'again', 'again', 20), review('2', 'again', 'easy', 10), review('3', 'easy', 'easy', 20), review('4', 'easy', 'again', 10), review('5', 'hard', 'hard', 20)];
    const options = { ...DEFAULT_STUDY_OPTIONS, excludeEasy: true };
    expect(eligibleStudyCards(cards, history, options).map(item => item.id)).toEqual(['again', 'hard', 'new']);
    expect(createSession([card('easy')], history, options, now).initialCount).toBe(0);
    expect(eligibleStudyCards(cards, history, DEFAULT_STUDY_OPTIONS)).toHaveLength(4);
  });
  it('shuffles every eligible card without duplicates or source mutation', () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(String(i)));
    const options = { ...DEFAULT_STUDY_OPTIONS, order: 'random' as const };
    const shuffled = createSession(cards, [], options, now, simpleScheduler, () => 0).queue.map(item => item.card.id);
    expect(shuffled).toEqual([...Array.from({ length: 39 }, (_, i) => String(i + 1)), '0']);
    expect(new Set(shuffled).size).toBe(40);
    expect(cards[0].id).toBe('0');
    expect(createSession(cards, [], options, now).initialCount).toBe(40);
  });
  it.each(['sequential', 'random', 'mastery'] as const)('includes all 1,000 cards in %s mode without an implicit cap', order => {
    const cards = Array.from({ length: 1000 }, (_, i) => card(String(i)));
    const session = createSession(cards, [], { ...DEFAULT_STUDY_OPTIONS, order }, now);
    expect(session.initialCount).toBe(1000);
    expect(new Set(session.queue.map(item => item.card.id))).toEqual(new Set(cards.map(item => item.id)));
  });
  it('prioritizes lower mastery with otherwise equal review data', () => {
    const cards = [card('known', { masteryLevel: 5 }), card('weak', { masteryLevel: 0 })];
    expect(createSession(cards, [], { ...DEFAULT_STUDY_OPTIONS, order: 'mastery' }, now).queue[0].card.id).toBe('weak');
  });
  it('finishes a one-card deck after one evaluation and rejects further advancement', () => {
    const initial = createSession([card()], [], DEFAULT_STUDY_OPTIONS, now);
    const finished = advanceSession(initial, card());
    expect(finished.queue).toHaveLength(0);
    expect(finished.completed).toBe(1);
    expect(() => advanceSession(finished, card())).toThrow('一致しません');
  });
  it('prioritizes neglected cards while retaining cards with future review dates', () => {
    const old = card('old', { reviewCount: 2, lastReviewedAt: now - 10 * DAY, nextReviewAt: now - 5 * DAY });
    const future = card('future', { reviewCount: 4, nextReviewAt: now + DAY });
    const session = createSession([card(), future, old], [], { ...DEFAULT_STUDY_OPTIONS, order: 'mastery' }, now);
    expect(session.queue.map(item => item.card.id)).toEqual(['old', 'a', 'future']);
  });
  it('prioritizes cards with a higher historical failure rate', () => {
    const history: Review[] = [{ id: 'r', cardId: 'b', reviewedAt: 1, rating: 'again', algorithm: 'simple-v1', previousNextReviewAt: 0, nextReviewAt: 1 }];
    expect(createSession([card('a'), card('b')], history, { ...DEFAULT_STUDY_OPTIONS, order: 'mastery' }, now).queue[0].card.id).toBe('b');
  });
  it('visits each card once even when a saved failure makes it due immediately', () => {
    let session = createSession(['a', 'b', 'c', 'a'].map(id => card(id)), [], DEFAULT_STUDY_OPTIONS, now);
    const visited: string[] = [];
    while (session.queue.length) {
      const current = session.queue[0].card;
      visited.push(current.id);
      session = advanceSession(session, { ...current, ...simpleScheduler.schedule(current, 'again', now) });
    }
    expect(visited).toEqual(['a', 'b', 'c']);
    expect(session.completed).toBe(3);
    expect(session.initialCount).toBe(3);
  });
  it('advances without mutating the previous session', () => {
    const initial = createSession([card()], [], DEFAULT_STUDY_OPTIONS, now);
    expect(advanceSession(initial, card()).queue).toHaveLength(0);
    expect(initial.queue).toHaveLength(1);
  });
});
describe('review transactions', () => {
  let db: CardsDatabase;
  let repo: ReturnType<typeof createRepository>;
  beforeEach(async () => { db = new CardsDatabase('srs-' + crypto.randomUUID()); repo = createRepository(db); await db.cards.put(card()); });
  afterEach(async () => { await db.delete(); });
  it('retains both imported image byte streams through every rating and reopening', async () => {
    const front = new Uint8Array([255, 216, 255, 1, 2, 3]);
    const back = new Uint8Array([137, 80, 78, 71, 4, 5]);
    await db.cards.update('a', {
      frontImage: new File([front], 'front.jpg', { type: 'image/jpeg' }),
      backImage: new File([back], 'back.png', { type: 'image/png' }),
    });
    for (const rating of ['again', 'hard', 'easy'] as const) {
      await repo.reviewCard('a', rating, rating, now);
      const saved = (await repo.snapshot()).cards[0];
      expect(new Uint8Array(await saved.frontImage!.arrayBuffer())).toEqual(front);
      expect(new Uint8Array(await saved.backImage!.arrayBuffer())).toEqual(back);
      expect(saved.frontImage!.type).toBe('image/jpeg');
      expect(saved.backImage!.type).toBe('image/png');
    }
    db.close(); await db.open();
    const saved = (await repo.snapshot()).cards[0];
    expect(saved.reviewCount).toBe(3);
    expect(new Uint8Array(await saved.frontImage!.arrayBuffer())).toEqual(front);
    expect(new Uint8Array(await saved.backImage!.arrayBuffer())).toEqual(back);
  });
  it('saves a rating and its history atomically and deduplicates concurrent retries', async () => {
    await Promise.all([repo.reviewCard('a', 'easy', 'same-event', now), repo.reviewCard('a', 'easy', 'same-event', now)]);
    const snapshot = await repo.snapshot();
    expect(snapshot.cards[0]).toMatchObject({ reviewCount: 1, masteryLevel: 1, nextReviewAt: now + DAY });
    expect(snapshot.reviews).toHaveLength(1);
    expect(snapshot.reviews[0]).toMatchObject({ algorithm: 'simple-v1', rating: 'easy' });
    await expect(repo.reviewCard('a', 'again', 'same-event', now)).rejects.toThrow('すでに');
  });
  it('rolls back card changes if history storage fails', async () => {
    db.reviews.hook('creating', () => { throw new Error('Simulated storage failure'); });
    await expect(repo.reviewCard('a', 'again', 'event', now)).rejects.toThrow('storage failure');
    expect((await db.cards.get('a'))!.reviewCount).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });
  it('rejects a deleted card without creating orphan history', async () => {
    await repo.deleteCard('a');
    await expect(repo.reviewCard('a', 'hard', 'event', now)).rejects.toThrow('見つかりません');
    expect(await db.reviews.count()).toBe(0);
  });
});
