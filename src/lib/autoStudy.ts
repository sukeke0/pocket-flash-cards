import type { Card, Deck } from './models';
import { cardsInDeck } from './decks';

// null means all decks, including decks added later; [] deliberately means none.
export type DeckSelection = string[] | null;
const key = `pocket-cards:${import.meta.env.BASE_URL}:auto-decks:v1`;
export function loadDeckSelection(storage: Pick<Storage, 'getItem'>): DeckSelection {
  const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) throw new Error('出題対象の設定を読み込めませんでした。');
  return [...new Set(value as string[])];
}
export function saveDeckSelection(storage: Pick<Storage, 'setItem'>, selection: DeckSelection) {
  storage.setItem(key, JSON.stringify(selection));
}
export function clearDeckSelection(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(key);
}
export function automaticCandidates(cards: Card[], decks: Deck[], selection: DeckSelection): Card[] {
  const selected = selection === null ? null : new Set(selection);
  const ids = new Set<string>();
  for (const deck of decks) {
    if (selected && !selected.has(deck.id)) continue;
    // Avoid rebuilding a full card index for every fixed deck.
    for (const id of deck.type === 'fixed' ? deck.cardIds : cardsInDeck(cards, deck).map(card => card.id)) ids.add(id);
  }
  return cards.filter(card => ids.has(card.id));
}
