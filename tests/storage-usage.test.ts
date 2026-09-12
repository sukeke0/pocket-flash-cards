import { describe, expect, it } from 'vitest';
import { formatBytes, measureData } from '../src/lib/storage';
import type { Snapshot, Card } from '../src/lib/models';

describe('storage usage', () => {
  it('counts each stored image and measures Japanese text as UTF-8 without image bytes in JSON', () => {
    const card: Card = { id: 'a', frontText: '日本語', backText: '裏面', frontImage: new Blob(['abc']), backImage: new Blob(['12345']), tags: [], createdAt: 0, updatedAt: 0, reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0, notes: '', customFields: {} };
    const snapshot: Snapshot = { cards: [card], tags: [], decks: [], reviews: [] };
    const expectedJson = JSON.stringify({ ...snapshot, cards: [{ ...card, frontImage: null, backImage: null }] });
    const recordBytes = new TextEncoder().encode(expectedJson).byteLength;
    expect(measureData(snapshot)).toEqual({ imageBytes: 8, imageCount: 2, recordBytes, totalBytes: recordBytes + 8 });
    expect(recordBytes).toBeGreaterThan(expectedJson.length);
    expect(measureData({ ...snapshot, cards: [] }).imageBytes).toBe(0);
  });
  it('formats decimal units consistently with the 200,000-byte image target', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(200_000)).toBe('200 KB');
    expect(formatBytes(3_000_000_000)).toBe('3 GB');
  });
});
