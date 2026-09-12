import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDelimited, countImportDuplicates, MAX_IMPORT_CHARS } from '../src/lib/transfer/delimited';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';

describe('CSV and TSV parsing', () => {
  it.each([',', '\t'])('accepts all six fields with delimiter %s', delimiter => {
    const source = [['front', 'back', 'tags', 'notes', 'frontLanguage', 'backLanguage'],
      ['hello', 'こんにちは', '挨拶', '朝の挨拶', 'en-us', 'ja-JP'],
      ['world', '世界', '', '', '', '']].map(row => row.join(delimiter)).join('\n');
    const result = parseDelimited(source);
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ frontText: 'hello', backText: 'こんにちは', tagNames: ['挨拶'], notes: '朝の挨拶', frontLanguage: 'en-US', backLanguage: 'ja-JP' });
    expect(result.rows[1]).toMatchObject({ frontLanguage: '', backLanguage: '' });
  });
  it('accepts reordered Japanese language headings', () => {
    const result = parseDelimited('裏面の読み上げ言語,裏面,表面の読み上げ言語,表面\nja-JP,こんにちは,en-GB,hello');
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ frontText: 'hello', backText: 'こんにちは', frontLanguage: 'en-GB', backLanguage: 'ja-JP' });
  });
  it('detects headered CSV and comma-separated Japanese tags', () => {
    const result = parseDelimited('front,back,tags\napple,りんご,"英単語,名詞"\nrun,走る,"英単語,動詞"');
    expect(result.issues).toEqual([]); expect(result.format).toBe('csv'); expect(result.hasHeader).toBe(true);
    expect(result.rows[0]).toMatchObject({ frontText: 'apple', backText: 'りんご', tagNames: ['英単語', '名詞'] });
    expect(result.rows).toHaveLength(2);
  });
  it('detects headerless TSV even when text and tags contain commas', () => {
    const result = parseDelimited('Hello, world\tこんにちは\t英語,挨拶\nrun\t走る\t');
    expect(result.format).toBe('tsv'); expect(result.hasHeader).toBe(false); expect(result.issues).toEqual([]);
    expect(result.rows[1].tagNames).toEqual([]);
  });
  it('supports reordered Japanese headings, BOM, CRLF, multiline quotes and escaped quotes', () => {
    const result = parseDelimited('\uFEFF裏面,表面,メモ,タグ\r\n"意味\r\n次の行","say ""hello""",memo,英語\r\n');
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ frontText: 'say "hello"', backText: '意味\n次の行', notes: 'memo', tagNames: ['英語'], line: 2 });
  });
  it('supports a whole AI code block using standard CSV quoting', () => {
    const result = parseDelimited('```csv\nfront,back,tags\napple,りんご,"英語,名詞"\n```');
    expect(result.issues).toEqual([]); expect(result.rows[0].tagNames).toEqual(['英語', '名詞']);
  });
  it('does not reinterpret typographic punctuation as CSV syntax', () => {
    expect(parseDelimited('front,back,tags\napple,りんご,“英語,名詞”').issues[0].message).toContain('列数');
    expect(parseDelimited('front,back\n"say “hello”",挨拶').rows[0].frontText).toBe('say “hello”');
  });
  it('preserves physical error lines after multiline fields and blank rows', () => {
    const result = parseDelimited('front,back\n"two\nlines",答え\n\nmissing');
    expect(result.issues[0]).toMatchObject({ line: 5 });
    expect(result.rows[0].line).toBe(2);
  });
  it('preserves empty trailing TSV columns and skips blank records', () => {
    const result = parseDelimited('\nfront\tback\ttags\tnotes\napple\tりんご\t\t\n\nrun\t走る\t\t');
    expect(result.issues).toEqual([]); expect(result.rows).toHaveLength(2); expect(result.rows[1].line).toBe(5);
  });
  it('allows overriding header detection and merges shared tags', () => {
    const result = parseDelimited('front,back', 'csv', 'none', '英語, 英語、基礎');
    expect(result.rows[0]).toMatchObject({ frontText: 'front', backText: 'back', tagNames: ['英語', '基礎'] });
  });
  it.each([
    ['front,back\napple', '列数'], ['front,back\napple,', '両方'],
    ['front,back\n"apple,りんご', '閉じて'], ['front,back\n"apple"oops,りんご', '引用符'],
    ['front,back,unsupported\na,b,c', 'ヘッダー'], ['front,back,__proto__\na,b,c', 'ヘッダー'],
    ['front,back,front\na,b,c', 'ヘッダー'], ['front,back', 'ありません'],
    ['   ', '貼り付け'], ['a,b,' + 'x'.repeat(81), '80文字'],
  ])('rejects malformed or unsupported input: %s', (source, error) => {
    expect(parseDelimited(source).issues.map(issue => issue.message).join(' ')).toContain(error);
  });
  it('rejects oversized text and more than 1000 cards', () => {
    expect(parseDelimited('x'.repeat(MAX_IMPORT_CHARS + 1)).issues[0].message).toContain('大きすぎ');
    expect(parseDelimited(Array.from({ length: 1001 }, (_, i) => i + ',a').join('\n')).issues[0].message).toContain('1,000');
  });
  it('counts duplicates against both existing cards and earlier input rows', () => {
    const rows = parseDelimited('a,b\nc,d\nc,d').rows;
    expect(countImportDuplicates(rows, [{ frontText: 'a', backText: 'b' }])).toBe(2);
  });
});
describe('atomic text import', () => {
  let db: CardsDatabase;
  let repo: ReturnType<typeof createRepository>;
  beforeEach(() => { db = new CardsDatabase('import-' + crypto.randomUUID()); repo = createRepository(db); });
  afterEach(async () => { await db.delete(); });
  it('stores imported languages and preserves an existing duplicate with different languages', async () => {
    await repo.importTextCards(parseDelimited('front,back,tags,notes,frontLanguage,backLanguage\nhello,こんにちは,挨拶,memo,en-US,ja-JP').rows);
    const original = (await repo.snapshot()).cards[0];
    expect(original).toMatchObject({ frontLanguage: 'en-US', backLanguage: 'ja-JP', notes: 'memo', reviewCount: 0 });
    expect(await repo.importTextCards(parseDelimited('front,back,frontLanguage,backLanguage\nhello,こんにちは,en-GB,ja').rows)).toMatchObject({ added: 0, skipped: 1 });
    expect((await repo.snapshot()).cards).toEqual([original]);
  });
  it('rejects invalid language metadata without saving any cards or tags', async () => {
    const rows = parseDelimited('front,back,tags\na,b,new\nc,d,new').rows;
    rows[1].frontLanguage = 'not_valid';
    await expect(repo.importTextCards(rows)).rejects.toThrow('読み上げ言語');
    expect(await db.cards.count()).toBe(0); expect(await db.tags.count()).toBe(0);
  });
  it('creates cards and tags, reuses tags, and leaves existing reviews unchanged', async () => {
    const tag = await repo.saveTag('英語');
    const oldId = await repo.saveCard({ frontText: 'old', backText: '既存', frontImage: null, backImage: null, tags: [tag], notes: '' });
    await repo.reviewCard(oldId, 'easy', 'review');
    const before = await db.cards.get(oldId);
    const rows = parseDelimited('front,back,tags\na,b,"英語,名詞"\na,b,skip-only\nold,既存,skip-only').rows;
    expect(await repo.importTextCards(rows)).toEqual({ added: 1, skipped: 2, tagsCreated: 1 });
    const snapshot = await repo.snapshot();
    expect(snapshot.cards).toHaveLength(2); expect(snapshot.tags.map(t => t.name).sort()).toEqual(['名詞', '英語']);
    expect(await db.cards.get(oldId)).toEqual(before); expect(snapshot.reviews).toHaveLength(1);
    expect(await repo.importTextCards(rows)).toEqual({ added: 0, skipped: 3, tagsCreated: 0 });
  });
  it('can explicitly include duplicates and accepts 1000 rows', async () => {
    const rows = parseDelimited(Array.from({ length: 1000 }, () => 'a,b').join('\n')).rows;
    expect(await repo.importTextCards(rows, false)).toMatchObject({ added: 1000 });
    expect(await db.cards.count()).toBe(1000);
  });
  it('serializes concurrent imports and skips duplicates under the transaction lock', async () => {
    const rows = parseDelimited('a,b,shared').rows;
    const results = await Promise.all([repo.importTextCards(rows), repo.importTextCards(rows)]);
    expect(results.reduce((sum, result) => sum + result.added, 0)).toBe(1);
    expect(await db.tags.count()).toBe(1);
  });
  it('rolls back newly created tags if saving a card fails', async () => {
    db.cards.hook('creating', () => { throw new Error('storage-full'); });
    await expect(repo.importTextCards(parseDelimited('a,b,new-tag').rows)).rejects.toThrow('storage-full');
    expect(await db.tags.count()).toBe(0); expect(await db.cards.count()).toBe(0);
  });
  it('rejects invalid rows before making any changes', async () => {
    await expect(repo.importTextCards([{ frontText: '', backText: 'b', tagNames: ['new'], notes: '' }])).rejects.toThrow();
    expect(await db.tags.count()).toBe(0);
  });
});
