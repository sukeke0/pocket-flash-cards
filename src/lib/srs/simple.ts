import type { Scheduler } from './types';

export const DAY = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A deliberately small scheduler. Stability is measured in days, not FSRS parameters. */
export const simpleScheduler: Scheduler = {
  id: 'simple-v1',
  schedule(card, rating, now) {
    const stability = rating === 'again' ? Math.max(0.02, card.stability * 0.35)
      : rating === 'hard' ? Math.max(0.1, card.stability * 0.8)
      : clamp(Math.max(1, card.stability * 2.4), 1, 365);
    const interval = rating === 'again' ? 60_000 : rating === 'hard' ? 600_000 : stability * DAY;
    return {
      reviewCount: card.reviewCount + 1, lastReviewedAt: now, nextReviewAt: now + interval,
      masteryLevel: clamp(card.masteryLevel + (rating === 'easy' ? 1 : rating === 'again' ? -1 : 0), 0, 5),
      difficulty: clamp(card.difficulty + (rating === 'again' ? 1 : rating === 'hard' ? 0.25 : -0.6), 1, 10),
      stability,
    };
  },
  priority(card, now) {
    const overdue = card.reviewCount === 0 ? 0 : Math.max(0, now - card.nextReviewAt) / DAY;
    const elapsed = card.lastReviewedAt === null ? 0 : Math.max(0, now - card.lastReviewedAt) / DAY;
    return (card.reviewCount === 0 ? 10 : 0) + 10 / (1 + card.reviewCount)
      + (5 - card.masteryLevel) * 6 + card.difficulty * 2 + Math.min(overdue, 365) * 3
      + Math.min(elapsed, 365) / (1 + card.stability) - Math.log1p(card.stability) * 2;
  },
};
