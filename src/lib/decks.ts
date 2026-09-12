import type { Card, Deck, DeckCondition, Tag } from './models';

/** Editor-only choices; only the resolved card IDs are saved in a deck. */
export interface DeckCardSelection {
  manualIds: string[];
  omittedIds: string[];
}

export function selectedDeckCardIds(selection: DeckCardSelection, matchingIds: string[]): string[] {
  const omitted = new Set(selection.omittedIds);
  return [...new Set([...selection.manualIds, ...matchingIds])].filter(id => !omitted.has(id));
}

export function toggleDeckCardSelection(selection: DeckCardSelection, matchingIds: string[], id: string): DeckCardSelection {
  if (selectedDeckCardIds(selection, matchingIds).includes(id)) {
    return { manualIds: selection.manualIds.filter(value => value !== id), omittedIds: [...new Set([...selection.omittedIds, id])] };
  }
  return { manualIds: [...new Set([...selection.manualIds, id])], omittedIds: selection.omittedIds.filter(value => value !== id) };
}

/** Tags are selection tools. Persist membership only, including when upgrading legacy decks. */
export function materializeDeck(deck: Deck, cards: Card[], now = Date.now()): Extract<Deck, { type: 'fixed' }> {
  const { id, name, createdAt, updatedAt, lastUsedAt } = deck;
  return { id, name, createdAt, updatedAt, lastUsedAt, type: 'fixed',
    cardIds: deck.type === 'fixed' ? [...new Set(deck.cardIds)] : cardsInDeck(cards, deck, now).map(card => card.id) };
}

const searchText = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
/** Determine membership across all decks, independently of any deck-list search. */
export function cardsWithoutDeck(cards: Card[], decks: Deck[], now = Date.now()): Card[] {
  const assigned = new Set<string>();
  for (const deck of decks) {
    const ids = deck.type === 'fixed' ? deck.cardIds : cardsInDeck(cards, deck, now).map(card => card.id);
    for (const id of ids) assigned.add(id);
  }
  return cards.filter(card => !assigned.has(card.id));
}

export function filterDeckCards(cards: Card[], tags: Tag[], query: string, tagIds: string[], match: 'all' | 'any' = 'all', excludedTagIds: string[] = []): Card[] {
  const words = searchText(query).trim().split(/\s+/).filter(Boolean);
  const names = new Map(tags.map(tag => [tag.id, tag.name]));
  return cards.filter(card => {
    // Exclusion always takes precedence, regardless of the inclusion match mode.
    if (excludedTagIds.some(id => card.tags.includes(id))) return false;
    if (tagIds.length && !(match === 'all' ? tagIds.every(id => card.tags.includes(id)) : tagIds.some(id => card.tags.includes(id)))) return false;
    if (!words.length) return true;
    const text = searchText([card.frontText, card.backText, card.notes, ...card.tags.map(id => names.get(id) ?? '')].join('\n'));
    return words.every(word => text.includes(word));
  });
}

export function matchesCondition(card: Card, condition: DeckCondition, now: number): boolean {
  switch (condition.field) {
    case 'tag': return card.tags.includes(condition.value);
    case 'unlearned': return (card.reviewCount === 0) === condition.value;
    case 'due': return (card.nextReviewAt <= now) === condition.value;
    case 'weak': return (card.reviewCount > 0 && card.masteryLevel < 2) === condition.value;
    default: {
      const value = card[condition.field];
      if (value === null) return false;
      return condition.operator === 'gte' ? value >= condition.value : value <= condition.value;
    }
  }
}
export function cardsInDeck(cards: Card[], deck: Deck, now = Date.now()): Card[] {
  if (deck.type === 'fixed') {
    const byId = new Map(cards.map(card => [card.id, card]));
    return [...new Set(deck.cardIds)].flatMap(id => { const card = byId.get(id); return card ? [card] : []; });
  }
  return cards.filter(card => deck.match === 'all'
    ? deck.conditions.every(condition => matchesCondition(card, condition, now))
    : deck.conditions.some(condition => matchesCondition(card, condition, now)));
}
export function getCounts(cards: Card[], now = Date.now()) {
  return {
    total: cards.length,
    due: cards.filter(card => card.reviewCount > 0 && card.nextReviewAt <= now).length,
    fresh: cards.filter(card => card.reviewCount === 0).length,
    weak: cards.filter(card => card.reviewCount > 0 && card.masteryLevel < 2).length,
  };
}
