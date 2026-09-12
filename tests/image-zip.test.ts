import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readImageZip } from '../src/lib/transfer/imageZip';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
const makeZip = (csv: string, images: Record<string, Uint8Array> = {}, list = 'cards.csv') => new Blob([new Uint8Array(zipSync({ [list]: strToU8(csv), ...images }))]);
const convert = async (file: File) => file;
const image = new Uint8Array([1, 2, 3]);

describe('image ZIP import', () => {
  it('reads quoted CSV, shared images, image-only faces, tags and notes in a wrapper folder', async () => {
    let conversions = 0;
    const rows = await readImageZip(makeZip('front,back,frontImage,backImage,tags,notes\n,りんご,apple.jpg,,"英語,名詞","1行目\n2行目"\napple,,apple.jpg,apple.jpg,,', { 'pack/images/apple.jpg': image }, 'pack/cards.csv'), () => {}, async file => { conversions++; return file; });
    expect(rows).toHaveLength(2); expect(conversions).toBe(1);
    expect(rows[0]).toMatchObject({ frontText: '', backText: 'りんご', tagNames: ['英語', '名詞'], notes: '1行目\n2行目' });
    expect(rows[0].frontImage?.type).toBe('image/jpeg');
  });
  it('supports TSV and images/ prefixes', async () => {
    const rows = await readImageZip(makeZip('\uFEFFfront\tback\tfrontImage\r\na\tb\timages/猫.png', { 'images/猫.png': image }, 'cards.tsv'), () => {}, convert);
    expect(rows[0].frontImage?.size).toBe(3);
  });
  it.each([
    ['front,back,frontImage\na,b,missing.jpg', {}, '画像が見つかりません'],
    ['front,back,frontImage\na,b,../a.jpg', {}, '相対ファイル名'],
    ['front,back\na,', {}, '文章か画像'],
    ['front,back\na,b,extra', {}, '列数'],
    ['front,back\n"a,b', {}, '引用符'],
    ['front,front,back\na,b,c', {}, '列名'],
    ['front,back,frontImage\na,b,a.svg', { 'images/a.svg': image }, '未対応'],
  ] as const)('rejects invalid rows before saving (%s)', async (csv, files, error) => {
    await expect(readImageZip(makeZip(csv, files), () => {}, convert)).rejects.toThrow(error);
  });
  it('rejects unsafe archives, multiple lists, and backup ZIPs', async () => {
    await expect(readImageZip(makeZip('front,back\na,b', { '../outside.png': image }), () => {}, convert)).rejects.toThrow('不正なパス');
    await expect(readImageZip(makeZip('front,back\na,b', { 'cards.tsv': image }), () => {}, convert)).rejects.toThrow('1つ');
    await expect(readImageZip(new Blob([new Uint8Array(zipSync({ 'data.json': strToU8('{}') }))]))).rejects.toThrow('バックアップ');
  });
  it('rejects more than 1,000 cards and propagates image decode failure with a row number', async () => {
    await expect(readImageZip(makeZip('front,back\n' + 'a,b\n'.repeat(1001)), () => {}, convert)).rejects.toThrow('1,000');
    await expect(readImageZip(makeZip('front,back,frontImage\na,b,a.jpg', { 'images/a.jpg': image }), () => {}, async () => { throw new Error('壊れた画像'); })).rejects.toThrow('2行目: 壊れた画像');
  });
  it('adds fresh cards atomically, retaining existing cards/decks/reviews and reusing tags', async () => {
    const db = new CardsDatabase('zip-' + crypto.randomUUID()); const repo = createRepository(db);
    try {
      const tag = await repo.saveTag('英語');
      const id = await repo.saveCard({ frontText: 'old', backText: 'keep', frontImage: null, backImage: null, tags: [tag], notes: '' });
      await repo.reviewCard(id, 'easy', 'r');
      await repo.saveDeck({ id: 'deck', name: 'keep', type: 'fixed', cardIds: [id], createdAt: 1, updatedAt: 1, lastUsedAt: null });
      const before = await repo.snapshot();
      const rows = await readImageZip(makeZip('front,back,frontImage,tags\nnew,new,a.png,"英語,追加"', { 'images/a.png': image }), () => {}, convert);
      expect(await repo.importImageCards(rows)).toEqual({ added: 1, tagsCreated: 1 });
      const after = await repo.snapshot();
      expect(after.cards.find(card => card.id === id)).toEqual(before.cards[0]);
      expect(after.decks).toEqual(before.decks); expect(after.reviews).toEqual(before.reviews);
      expect(after.cards.find(card => card.id !== id)).toMatchObject({ reviewCount: 0, masteryLevel: 0 });
      db.cards.hook('creating', () => { throw new Error('Simulated failure'); });
      await expect(repo.importImageCards([{ ...rows[0], tagNames: ['rollback'] }])).rejects.toThrow();
      expect(await repo.snapshot()).toEqual(after);
    } finally { await db.delete(); }
  });
});
