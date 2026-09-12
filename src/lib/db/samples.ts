import type { Card, Rating, Review, Snapshot } from '../models';
import { simpleScheduler } from '../srs/simple';

/** Used by first creation and explicit reset, never by upgrades. */
export function createSamples(now = Date.now()): Snapshot {
  const tagId = crypto.randomUUID();
  const words = [
    ['apple', 'りんご', 'I eat an apple.（りんごを食べます。）'],
    ['dog', '犬', 'I like dogs.（犬が好きです。）'],
    ['cat', '猫', 'This is a cat.（これは猫です。）'],
    ['book', '本', 'I read a book.（本を読みます。）'],
    ['sun', '太陽', 'The sun is bright.（太陽は明るいです。）'],
  ];
  const daysAgo = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days); date.setHours(12, 0, 0, 0);
    return date.getTime();
  };
  const cards: Card[] = words.map(([frontText, backText, notes], index) => ({
    id: crypto.randomUUID(), frontText, backText, notes,
    frontLanguage: 'en-US', backLanguage: 'ja-JP', frontImage: null, backImage: null,
    tags: [tagId], createdAt: daysAgo(8) - index, updatedAt: now - index,
    reviewCount: 0, lastReviewedAt: null, nextReviewAt: daysAgo(8),
    masteryLevel: 0, difficulty: 5, stability: 0, customFields: {},
  }));
  const reviews: Review[] = [];
  const review = (card: Card, rating: Rating, days: number) => {
    const reviewedAt = daysAgo(days);
    const result = simpleScheduler.schedule(card, rating, reviewedAt);
    reviews.push({ id: crypto.randomUUID(), cardId: card.id, rating, reviewedAt,
      algorithm: simpleScheduler.id, previousNextReviewAt: card.nextReviewAt, nextReviewAt: result.nextReviewAt });
    Object.assign(card, result);
  };
  // apple: mastered; dog/cat/book: reviewing; sun: unlearned.
  for (const days of [7, 4, 1]) review(cards[0], 'easy', days);
  for (const card of cards.slice(1, 4)) review(card, 'hard', 1);
  return {
    cards,
    tags: [{ id: tagId, name: 'サンプル', createdAt: now, updatedAt: now }],
    decks: [{ id: crypto.randomUUID(), name: 'はじめての英語（サンプル）', type: 'fixed', cardIds: cards.map(card => card.id), createdAt: now, updatedAt: now, lastUsedAt: null }],
    reviews,
  };
}
