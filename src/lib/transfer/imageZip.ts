import { unzipSync } from 'fflate';
import type { ImageCardInput } from '../models';
import { readImage } from '../images';
import { languageFields } from '../speech/languages';
import { MAX_IMPORT_CARDS, MAX_IMPORT_CHARS, parseTagNames, readRecords } from './delimited';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
function safePath(path: string) {
  return path.length > 0 && !path.startsWith('/') && !/[\\:\u0000]/.test(path) && !path.split('/').some(part => part === '..' || part === '.');
}

/** Read an additive import, independently of the exact-restoration backup format. */
export async function readImageZip(file: Blob, progress: (done: number, total: number) => void = () => {}, convert = readImage): Promise<ImageCardInput[]> {
  if (file.size > 50 * 1024 * 1024) throw new Error('追加用ZIPは50MB以内に分けてください。');
  let size = 0;
  const names = new Set<string>();
  const files = new Map(Object.entries(unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
    if (!safePath(entry.name) || names.has(entry.name)) throw new Error('ZIPに不正なパスまたは重複したファイル名があります。');
    names.add(entry.name); size += entry.originalSize;
    if (size > 100 * 1024 * 1024 || names.size > 5000) throw new Error('ZIPの展開サイズ（100MB）またはファイル数（5,000件）が上限を超えています。');
    return !entry.name.endsWith('/') && !entry.name.startsWith('__MACOSX/');
  } })));
  const lists = [...files.keys()].filter(name => /(^|\/)cards\.(csv|tsv)$/i.test(name));
  if (lists.length !== 1) throw new Error('cards.csv または cards.tsv を1つ入れてください。バックアップZIPは「バックアップから復元」で読み込みます。');
  const list = lists[0];
  const root = list.slice(0, list.lastIndexOf('/') + 1);
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(files.get(list)); }
  catch { throw new Error('cards.csv / cards.tsv はUTF-8で保存してください。'); }
  if (source.length > MAX_IMPORT_CHARS) throw new Error('カード一覧は100万文字以内にしてください。');
  const parsed = readRecords(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), /\.tsv$/i.test(list) ? '\t' : ',');
  if (parsed.issues.length) throw new Error(`${parsed.issues[0].line}行目: ${parsed.issues[0].message}`);
  const [header, ...records] = parsed.records;
  const columns = header?.cells.map(cell => cell.toLowerCase()) ?? [];
  if (!columns.includes('front') || !columns.includes('back') || new Set(columns).size !== columns.length || columns.some(name => !['front', 'back', 'frontimage', 'backimage', 'tags', 'notes', 'frontlanguage', 'backlanguage'].includes(name))) {
    throw new Error('先頭行に front,back,frontImage,backImage,tags,notes の列名を指定してください。front と back は必須です。');
  }
  if (!records.length || records.length > MAX_IMPORT_CARDS) throw new Error('カードは1〜1,000枚に分けてください。');
  const cache = new Map<string, Blob>();
  async function image(name: string): Promise<Blob | null> {
    if (!name) return null;
    if (!safePath(name)) throw new Error(`画像はZIP内の相対ファイル名で指定してください: ${name}`);
    const path = root + (name.startsWith('images/') ? name : `images/${name}`);
    const bytes = files.get(path);
    if (!bytes) throw new Error(`画像が見つかりません: ${name}`);
    const mime = MIME[name.split('.').at(-1)!.toLowerCase()];
    if (!mime) throw new Error(`未対応の画像形式です: ${name}`);
    if (!cache.has(path)) cache.set(path, await convert(new File([new Uint8Array(bytes)], name, { type: mime })));
    return cache.get(path)!;
  }
  const rows: ImageCardInput[] = [];
  progress(0, records.length);
  for (const record of records) {
    try {
      if (record.cells.length !== columns.length) throw new Error('列数が先頭行と一致しません。');
      const value = (field: string) => record.cells[columns.indexOf(field)] ?? '';
      const tagNames = parseTagNames(value('tags'));
      if (tagNames.some(tag => tag.length > 80)) throw new Error('タグは80文字以内にしてください。');
      const frontText = value('front'), backText = value('back');
      const frontImage = await image(value('frontimage'));
      const backImage = await image(value('backimage'));
      if ((!frontText && !frontImage) || (!backText && !backImage)) throw new Error('表面・裏面それぞれに文章か画像が必要です。');
      rows.push({ frontText, backText, frontImage, backImage, tagNames, notes: value('notes'), ...languageFields({ frontLanguage: columns.includes('frontlanguage') ? value('frontlanguage') : undefined, backLanguage: columns.includes('backlanguage') ? value('backlanguage') : undefined }) });
      progress(rows.length, records.length);
    } catch (error) { throw new Error(`${record.line}行目: ${error instanceof Error ? error.message : '画像を読み込めません。'}`); }
  }
  return rows;
}
