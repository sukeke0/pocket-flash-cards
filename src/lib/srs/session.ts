import type { Card, Rating, Review } from '../models';
import type { Scheduler } from './types';
import { simpleScheduler } from './simple';

export interface StudyItem { card: Card; reviewId: string; repeated?: boolean }
export interface StudyOptions {
  mode?: 'automatic' | 'deck' | 'full';
  order: 'sequential' | 'random' | 'mastery';
  excludeEasy: boolean;
  reverse: boolean;
  /** Session-only fallback when all scheduled reviews are already complete. */
  includeScheduled?: boolean;
  repeatAgain?: boolean;
  repeatHard?: boolean;
  /** Home automatic study only. Unique reviewed cards per local calendar day. */
  dailyLimit?: number;
}
export const DEFAULT_STUDY_OPTIONS: StudyOptions = { order: 'sequential', excludeEasy: false, reverse: false };
export interface StudySession { queue: StudyItem[]; completed: number; initialCount: number }

function dailyBudget(cards: Card[], history: Review[], options: StudyOptions, now: number) {
  if (options.mode !== 'automatic' || !Number.isSafeInteger(options.dailyLimit) || !options.dailyLimit || options.dailyLimit < 1) return null;
  const ids = new Set(cards.map(card => card.id));
  const date = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const reviewed = new Set(history.filter(review => ids.has(review.cardId) && review.reviewedAt >= start && review.reviewedAt < end).map(review => review.cardId));
  const target = Math.min(options.dailyLimit, ids.size);
  const remaining = Math.max(0, target - reviewed.size);
  return { reviewed, target, remaining, complete: target > 0 && remaining === 0 };
}

function sessionSelection(cards: Card[], history: Review[], options: StudyOptions, now: number) {
  const budget = dailyBudget(cards, history, options, now);
  const eligible = eligibleStudyCards(cards, history, options, now);
  const selected = budget && !budget.complete ? eligible.filter(card => !budget.reviewed.has(card.id)) : eligible;
  return { selected, budget, limit: budget ? (budget.complete ? budget.target : budget.remaining) : selected.length };
}

/** The most recent rating determines exclusion; old easy ratings never hide a later failure. */
export function eligibleStudyCards(cards: Card[], history: Review[], options: StudyOptions, now = Date.now()): Card[] {
  const latest = new Map<string, Review>();
  if (options.excludeEasy) for (const review of history) {
    if (review.reviewedAt >= (latest.get(review.cardId)?.reviewedAt ?? -Infinity)) latest.set(review.cardId, review);
  }
  const seen = new Set<string>();
  return cards.filter(card => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    const dailyAutomatic = options.mode === 'automatic' && Number.isSafeInteger(options.dailyLimit) && (options.dailyLimit ?? 0) > 0;
    if (!dailyAutomatic && !options.includeScheduled && options.mode && options.mode !== 'full' && card.reviewCount > 0 && card.nextReviewAt > now) return false;
    return !options.excludeEasy || latest.get(card.id)?.rating !== 'easy';
  });
}

/** Keep studying possible for a nonempty deck, without changing stored SRS dates. */
export function planStudyStart(cards: Card[], history: Review[], requested: StudyOptions, now = Date.now()) {
  const options = { ...requested, includeScheduled: false };
  const reviewComplete = !!cards.length && (options.mode === 'automatic' || options.mode === 'deck')
    && !eligibleStudyCards(cards, history, { ...options, dailyLimit: undefined, excludeEasy: false }, now).length;
  if (reviewComplete) options.includeScheduled = true;
  let selection = sessionSelection(cards, history, options, now);
  const exclusionRelaxed = !!cards.length && !selection.selected.length && options.excludeEasy;
  if (exclusionRelaxed) {
    options.excludeEasy = false;
    selection = sessionSelection(cards, history, options, now);
  }
  const notice = [
    selection.budget?.complete ? `今日の学習目標（${selection.budget.target}枚）は達成しています。引き続き、追加で学習できます。` : '',
    reviewComplete ? '今日の復習は終わっています。引き続き、復習時刻にかかわらずデッキ内のカードを学習できます。' : '',
    exclusionRelaxed ? '「余裕を除外」すると対象がなくなるため、今回は「余裕」のカードも含めて学習します。' : '',
  ].filter(Boolean).join('\n');
  return { options, count: Math.min(selection.selected.length, selection.limit), notice };
}

/** Select and order once per session. Input cards and history are never mutated. */
export function createSession(cards: Card[], history: Review[], options = DEFAULT_STUDY_OPTIONS, now = Date.now(), scheduler: Scheduler = simpleScheduler, random = Math.random): StudySession {
  const failures = new Map<string, number>();
  for (const review of history) if (review.rating === 'again') failures.set(review.cardId, (failures.get(review.cardId) ?? 0) + 1);
  const priority = (card: Card) => scheduler.priority(card, now) + 8 * (failures.get(card.id) ?? 0) / Math.max(1, card.reviewCount);
  const { selected, budget, limit } = sessionSelection(cards, history, options, now);
  const due = (card: Card) => Number(card.reviewCount === 0 || card.nextReviewAt <= now);
  if (options.mode === 'automatic' || options.order === 'mastery') selected.sort((a, b) => (budget ? due(b) - due(a) : 0) || priority(b) - priority(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  else if (options.order === 'random') {
    // Fisher–Yates: change only the order; every eligible card is included.
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
  }
  const limited = selected.slice(0, limit);
  return { queue: limited.map(card => ({ card, reviewId: crypto.randomUUID() })), completed: 0, initialCount: limited.length };
}

/** Advance after a saved rating or an explicit skip. This function never writes learning data. */
export function advanceSession(session: StudySession, card: Card, retry?: { rating: Rating; repeatAgain?: boolean; repeatHard?: boolean }): StudySession {
  const [current, ...queue] = session.queue;
  if (!current || current.card.id !== card.id) throw new Error('学習中のカードが一致しません。');
  if (!current.repeated && retry && ((retry.rating === 'again' && retry.repeatAgain) || (retry.rating === 'hard' && retry.repeatHard))) {
    queue.push({ card, reviewId: crypto.randomUUID(), repeated: true });
  }
  return { ...session, queue, completed: session.completed + 1 };
}
