import Dexie, { type Table } from 'dexie';
import type { Card, Tag, Deck, Review } from '../models';
import { materializeDeck } from '../decks';
import { createSamples } from './samples';

export class CardsDatabase extends Dexie {
  cards!: Table<Card, string>;
  tags!: Table<Tag, string>;
  decks!: Table<Deck, string>;
  reviews!: Table<Review, string>;
  constructor(name = `pocket-cards:${import.meta.env.BASE_URL}`, withSamples = false) {
    super(name);
    this.version(1).stores({
      cards: 'id, *tags, createdAt, updatedAt, nextReviewAt, reviewCount',
      tags: 'id, &name',
      decks: 'id, type, updatedAt, lastUsedAt',
      reviews: 'id, cardId, reviewedAt, [cardId+reviewedAt]',
    });
    // Resolve previous tag conditions once. Subsequent tag changes never alter membership.
    this.version(2).stores({}).upgrade(async transaction => {
      const cards = await transaction.table<Card, string>('cards').toArray();
      const decks = transaction.table<Deck, string>('decks');
      const now = Date.now();
      for (const deck of await decks.toArray()) {
        if (deck.type === 'dynamic') await decks.put(materializeDeck(deck, cards, now));
      }
    });
    if (withSamples) this.on('populate', async transaction => {
      const sample = createSamples();
      await transaction.table<Tag, string>('tags').bulkAdd(sample.tags);
      await transaction.table<Card, string>('cards').bulkAdd(sample.cards);
      await transaction.table<Deck, string>('decks').bulkAdd(sample.decks);
      await transaction.table<Review, string>('reviews').bulkAdd(sample.reviews);
    });
  }
}
export const db = new CardsDatabase(undefined, true);
