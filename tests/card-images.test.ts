import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import { copyCardImages } from '../src/lib/db/cardImages';
import type { Card } from '../src/lib/models';

const bytes = new Uint8Array([1, 2, 3, 4]);
let readable = true;
// Model a file-backed Blob whose reference expires when its record is replaced.
// A wrapper Blob or a shallow card copy must not be treated as a byte copy.
class FileBackedImage extends Blob {
  override async arrayBuffer() {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (!readable) throw new DOMException('Stale file reference', 'NotReadableError');
    return super.arrayBuffer();
  }
}
const image = () => new FileBackedImage([bytes], { type: 'image/png' });
const card = (): Card => ({
  id: 'a', frontText: 'apple', backText: 'りんご', frontImage: image(), backImage: image(),
  tags: ['tag'], notes: '', customFields: {}, createdAt: 1, updatedAt: 1,
  reviewCount: 0, lastReviewedAt: null, nextReviewAt: 0, masteryLevel: 0, difficulty: 5, stability: 0,
});

describe('image references across card writes', () => {
  let db: CardsDatabase;
  let repo: ReturnType<typeof createRepository>;
  beforeEach(async () => {
    readable = true;
    db = new CardsDatabase('images-' + crypto.randomUUID());
    repo = createRepository(db);
    await db.tags.put({ id: 'tag', name: '果物', createdAt: 1, updatedAt: 1 });
    await db.cards.put(card());
  });
  afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });

  it('keeps copied image bytes readable after their original reference expires', async () => {
    const original = card();
    const copied = await copyCardImages(original);
    readable = false;
    await expect(original.frontImage!.arrayBuffer()).rejects.toThrow('Stale file reference');
    expect(new Uint8Array(await copied.frontImage!.arrayBuffer())).toEqual(bytes);
    expect(new Uint8Array(await copied.backImage!.arrayBuffer())).toEqual(bytes);
    expect(copied.frontImage!.type).toBe('image/png');
  });

  it.each(['review', 'edit', 'clearHistory', 'deleteTag'] as const)('%s writes independent bytes instead of reusing the database image reference', async operation => {
    // Dexie's reading hook supplies transient file references, as Safari can do.
    db.cards.hook('reading', value => value ? { ...value, frontImage: image(), backImage: image() } : value);
    const written: Card[] = [];
    const originalPut = db.cards.put.bind(db.cards);
    vi.spyOn(db.cards, 'put').mockImplementation(value => {
      written.push(value);
      return originalPut(value);
    });
    if (operation === 'review') await repo.reviewCard('a', 'easy', 'review');
    if (operation === 'edit') await repo.saveCard({ ...card(), frontText: 'edited' }, 'a');
    if (operation === 'clearHistory') await repo.clearLearningHistory();
    if (operation === 'deleteTag') await repo.deleteTag('tag');
    readable = false;
    expect(written).toHaveLength(1);
    expect(new Uint8Array(await written[0].frontImage!.arrayBuffer())).toEqual(bytes);
    expect(new Uint8Array(await written[0].backImage!.arrayBuffer())).toEqual(bytes);
  });

  it('rolls back a review when either image cannot be read, preserving card and history', async () => {
    db.cards.hook('reading', value => value ? { ...value, backImage: image() } : value);
    readable = false;
    await expect(repo.reviewCard('a', 'easy', 'failed')).rejects.toThrow('保存を中止');
    expect((await db.cards.get('a'))!.reviewCount).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });
});
