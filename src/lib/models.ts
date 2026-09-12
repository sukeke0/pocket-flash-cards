export type Rating = 'again' | 'hard' | 'easy';
export interface Card {
  id: string;
  frontText: string;
  backText: string;
  frontImage: Blob | null;
  backImage: Blob | null;
  frontLanguage?: string;
  backLanguage?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  reviewCount: number;
  lastReviewedAt: number | null;
  nextReviewAt: number;
  masteryLevel: number;
  difficulty: number;
  stability: number;
  notes: string;
  customFields: Record<string, string>;
}
export type CardInput = Pick<Card, 'frontText' | 'backText' | 'frontImage' | 'backImage' | 'frontLanguage' | 'backLanguage' | 'tags' | 'notes'>;
export interface TextCardInput { frontText: string; backText: string; tagNames: string[]; notes: string; frontLanguage?: string; backLanguage?: string }
export interface ImageCardInput extends TextCardInput { frontImage: Blob | null; backImage: Blob | null }
export interface Tag { id: string; name: string; createdAt: number; updatedAt: number }
export type DeckCondition =
  | { field: 'tag'; value: string }
  | { field: 'unlearned' | 'due' | 'weak'; value: boolean }
  | { field: 'masteryLevel' | 'reviewCount' | 'lastReviewedAt'; operator: 'gte' | 'lte'; value: number };
interface DeckBase { id: string; name: string; createdAt: number; updatedAt: number; lastUsedAt: number | null }
export type Deck = DeckBase & (
  | { type: 'fixed'; cardIds: string[] }
  // Read compatibility only. Database upgrade, restore and save materialize these as card IDs.
  | { type: 'dynamic'; match: 'all' | 'any'; conditions: DeckCondition[] }
);
export interface Review {
  id: string; cardId: string; reviewedAt: number; rating: Rating;
  algorithm: string; previousNextReviewAt: number; nextReviewAt: number;
}
export interface Snapshot { cards: Card[]; tags: Tag[]; decks: Deck[]; reviews: Review[] }
