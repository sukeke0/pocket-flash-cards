import { describe, expect, it } from 'vitest';
import type { Card, Review } from '../src/lib/models';
import { createSession, DEFAULT_STUDY_OPTIONS, planStudyStart } from '../src/lib/srs/session';
import { DAY } from '../src/lib/srs/simple';

const now = new Date(2026, 8, 11, 12).getTime();
const options = { ...DEFAULT_STUDY_OPTIONS, mode: 'automatic' as const, dailyLimit: 30 };
const card = (id: string, changes: Partial<Card> = {}): Card => ({
  id, frontText: id, backText: 'answer', frontImage: null, backImage: null,
  tags: [], notes: '', customFields: {}, createdAt: 1, updatedAt: 1,
  reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0, ...changes,
});
const cards = (count: number) => Array.from({ length: count }, (_, i) => card(String(i)));
const review = (cardId: string, reviewedAt = now): Review => ({
  id: crypto.randomUUID(), cardId, reviewedAt, rating: 'hard', algorithm: 'test', previousNextReviewAt: 0, nextReviewAt: reviewedAt + 600_000,
});

describe('automatic daily study', () => {
  it.each([20, 100])('caps a %s-card collection at the smaller of its unique total and the daily goal', total => {
    const source = cards(total);
    const duplicated = [...source, source[0]];
    const plan = planStudyStart(duplicated, [], options, now);
    const session = createSession(duplicated, [], plan.options, now);
    expect(plan.count).toBe(Math.min(total, 30));
    expect(session.initialCount).toBe(plan.count);
    expect(new Set(session.queue.map(item => item.card.id)).size).toBe(plan.count);
    expect(duplicated).toHaveLength(total + 1);
  });
  it('selects by SRS priority before applying the cap, prioritizing due cards over future reviews', () => {
    const source = [card('future', { reviewCount: 1, nextReviewAt: now + DAY }), card('new'), card('overdue', { reviewCount: 2, lastReviewedAt: now - 10 * DAY, nextReviewAt: now - 5 * DAY })];
    const session = createSession(source, [], { ...options, dailyLimit: 2 }, now);
    expect(session.queue.map(item => item.card.id)).toEqual(['overdue', 'new']);
    expect(source[0].id).toBe('future');
  });
  it('subtracts unique reviews in the selected decks, ignoring repeats and unrelated or deleted cards', () => {
    const source = cards(100);
    const history = [review('0'), review('0'), review('1'), review('deleted'), review('other-deck')];
    const plan = planStudyStart(source, history, options, now);
    const session = createSession(source, history, plan.options, now);
    expect(plan.count).toBe(28); expect(session.initialCount).toBe(28);
    expect(session.queue.some(item => ['0', '1'].includes(item.card.id))).toBe(false);
  });
  it('recalculates remaining cards when restarting after partial study without counting skips', () => {
    const source = cards(40);
    const first = createSession(source, [], options, now);
    // Only saved reviews count: the next card was skipped and has no history.
    const history = first.queue.slice(0, 4).map(item => review(item.card.id));
    const plan = planStudyStart(source, history, options, now);
    const restarted = createSession(source, history, plan.options, now);
    expect(plan.count).toBe(26);
    expect(restarted.queue.some(item => item.card.id === first.queue[4].card.id)).toBe(true);
  });
  it('uses local midnight boundaries for counting and resets on the next day', () => {
    const start = new Date(2026, 8, 11).getTime();
    const tomorrow = new Date(2026, 8, 12).getTime();
    const source = cards(40);
    const history = [review('0', start - 1), review('1', start), review('2', tomorrow - 1), review('3', tomorrow)];
    expect(planStudyStart(source, history, options, now).count).toBe(28);
    expect(planStudyStart(source, history.slice(0, 3), options, tomorrow).count).toBe(30);
  });
  it('allows another capped session and shows a notice after the daily goal is achieved', () => {
    const source = cards(40);
    const history = source.slice(0, 30).map(item => review(item.id));
    const plan = planStudyStart(source, history, options, now);
    expect(plan.notice).toContain('今日の学習目標（30枚）は達成');
    expect(plan.count).toBe(30);
    expect(createSession(source, history, plan.options, now).initialCount).toBe(30);
  });
  it('fills the daily goal with future cards when fewer cards are due and permits study after all reviews are done', () => {
    const source = cards(5).map(item => ({ ...item, reviewCount: 1, nextReviewAt: now + DAY }));
    const plan = planStudyStart(source, [], options, now);
    expect(plan.notice).toContain('今日の復習は終わっています');
    expect(plan.count).toBe(5); expect(createSession(source, [], plan.options, now).initialCount).toBe(5);
    const partlyDue = [{ ...source[0], nextReviewAt: 0 }, ...source.slice(1)];
    expect(planStudyStart(partlyDue, [], options, now).count).toBe(5);
  });
  it('relaxes easy exclusion when all remaining daily candidates would be hidden', () => {
    const source = cards(5);
    const history = [review('0'), ...source.slice(1).map(item => ({ ...review(item.id, now - DAY), rating: 'easy' as const }))];
    const plan = planStudyStart(source, history, { ...options, excludeEasy: true }, now);
    expect(plan.count).toBe(4); expect(plan.options.excludeEasy).toBe(false);
    expect(plan.notice).toContain('今回は「余裕」のカードも含め');
    expect(createSession(source, history, plan.options, now).initialCount).toBe(4);
  });
  it('does not limit deck or full study and leaves an empty selection empty', () => {
    for (const mode of ['deck', 'full'] as const) {
      const plan = planStudyStart(cards(100), [], { ...options, mode }, now);
      expect(plan.count).toBe(100);
      expect(createSession(cards(100), [], plan.options, now).initialCount).toBe(100);
    }
    const plan = planStudyStart([], [], options, now);
    expect(plan.count).toBe(0); expect(plan.notice).toBe('');
  });
});
