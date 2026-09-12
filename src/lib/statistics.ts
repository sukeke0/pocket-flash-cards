import type { Card, Deck, Review } from './models';
import { cardsInDeck } from './decks';

export type StatisticsScope = { kind: 'all' } | { kind: 'deck'; deckId: string } | { kind: 'tags'; tagIds: string[]; match: 'all' | 'any' };
/** Attribute history to the card's current membership, not the deck used at review time. */
export function selectStatisticsCards(cards: Card[], decks: Deck[], scope: StatisticsScope): Card[] {
  if (scope.kind === 'all') return cards;
  if (scope.kind === 'deck') {
    const deck = decks.find(item => item.id === scope.deckId);
    return deck ? cardsInDeck(cards, deck) : [];
  }
  if (!scope.tagIds.length) return [];
  return cards.filter(card => scope.match === 'all'
    ? scope.tagIds.every(id => card.tags.includes(id))
    : scope.tagIds.some(id => card.tags.includes(id)));
}

export type Mastery = 'mastered' | 'unmastered' | 'unlearned';
/** Simple-v1 interpretation. Keep separate from presentation for a future scheduler. */
export function classifyMastery(card: Card): Mastery {
  if (!card.reviewCount) return 'unlearned';
  if (card.reviewCount >= 3 && card.masteryLevel >= 3 && card.stability >= 5 && card.difficulty <= 5) return 'mastered';
  return 'unmastered';
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
export function calculateStatistics(cards: Card[], reviews: Review[], now = new Date(), days = 7) {
  const validIds = new Set(cards.map(card => card.id));
  const buckets = Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + i);
    return { key: localDateKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, ids: new Set<string>(), reviews: 0 };
  });
  const byDay = new Map(buckets.map(bucket => [bucket.key, bucket]));
  for (const review of reviews) {
    if (!validIds.has(review.cardId)) continue;
    const bucket = byDay.get(localDateKey(new Date(review.reviewedAt)));
    if (bucket) { bucket.ids.add(review.cardId); bucket.reviews++; }
  }
  const counts: Record<Mastery, number> = { mastered: 0, unmastered: 0, unlearned: 0 };
  for (const card of cards) counts[classifyMastery(card)]++;
  const trend = buckets.map(bucket => ({ key: bucket.key, label: bucket.label, cards: bucket.ids.size, reviews: bucket.reviews }));
  return { total: cards.length, today: trend[trend.length - 1], trend,
    mastery: (['mastered', 'unmastered', 'unlearned'] as const).map(key => ({ key, count: counts[key], percent: cards.length ? counts[key] / cards.length * 100 : 0 })) };
}
export type Statistics = ReturnType<typeof calculateStatistics>;
