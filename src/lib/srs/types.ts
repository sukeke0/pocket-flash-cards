import type { Card, Rating } from '../models';

// UI-independent contract. FSRS can replace the simple scheduler without UI changes.
export interface Scheduler {
  readonly id: string;
  schedule(card: Readonly<Card>, rating: Rating, now: number): Pick<Card,
    'reviewCount' | 'lastReviewedAt' | 'nextReviewAt' | 'masteryLevel' | 'difficulty' | 'stability'>;
  priority(card: Readonly<Card>, now: number): number;
}
