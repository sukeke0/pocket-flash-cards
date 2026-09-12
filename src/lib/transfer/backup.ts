import { languageFields } from '../speech/languages';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Card, Snapshot } from '../models';
import { MAX_IMAGE_BYTES } from '../images';
import { parseBackupData, SCHEMA_VERSION, type ArchivedCard } from './backupSchema';

export { SCHEMA_VERSION } from './backupSchema';
const MAX_ARCHIVE = 100 * 1024 * 1024;
const MAX_EXPANDED = 200 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export async function exportBackup(snapshot: Snapshot): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const cards: ArchivedCard[] = [];
  let bytes = 0;
  for (const [index, card] of snapshot.cards.entries()) {
    const archived: ArchivedCard = { ...card, frontImage: null, backImage: null };
    for (const side of ['frontImage', 'backImage'] as const) {
      const blob = card[side];
      if (!blob) continue;
      const ext = Object.keys(MIME).find(key => MIME[key] === blob.type);
      if (!ext) throw new Error('未対応形式の画像があります。');
      const path = `images/${index}-${side}.${ext}`;
      bytes += blob.size;
      if (bytes > MAX_ARCHIVE - 1024 * 1024) throw new Error('バックアップの上限（100MB）を超えています。画像を減らしてください。');
      files[path] = new Uint8Array(await blob.arrayBuffer());
      archived[side] = path;
    }
    cards.push(archived);
  }
  files['data.json'] = strToU8(JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), ...snapshot, cards }));
  const zipped = zipSync(files, { level: 0 });
  if (zipped.byteLength > MAX_ARCHIVE) throw new Error('バックアップの上限（100MB）を超えています。');
  return new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
}

function fail(message = 'バックアップのデータ形式が正しくありません。'): never { throw new Error(message); }

// Validate and resolve all files BEFORE opening the destructive restore transaction.
// Future versions migrate into the current shape here, independently of Dexie migrations.
export async function readBackup(file: Blob): Promise<Snapshot> {
  if (file.size > MAX_ARCHIVE) return fail('ZIPは100MB以内にしてください。');
  let expanded = 0;
  let entries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        expanded += entry.originalSize;
        entries++;
        if (expanded > MAX_EXPANDED || entries > 50000) fail('ZIPの展開サイズまたはファイル数が上限を超えています。');
        return true;
      },
    });
  } catch { return fail('ZIPを読み込めません。破損しているか、展開サイズが上限を超えています。'); }
  if (!files['data.json']) return fail('data.jsonがありません。Pocket Flash CardsのバックアップZIPを選択してください。');
  let json: unknown;
  try { json = JSON.parse(strFromU8(files['data.json'])); } catch { return fail('data.jsonを読み込めません。'); }
  const data = parseBackupData(json);
  const image = (path: string | null): Blob | null => {
    if (path === null) return null;
    if (!/^images\/[a-zA-Z0-9_-]+\.(jpg|png|webp|gif)$/.test(path)) return fail('画像パスが正しくありません。');
    const bytes = files[path];
    if (!bytes) return fail(`画像が見つかりません: ${path}`);
    if (bytes.length > MAX_IMAGE_BYTES) return fail('画像が10MBを超えています。');
    return new Blob([new Uint8Array(bytes)], { type: MIME[path.split('.').at(-1)!] });
  };
  const cards = data.cards.map((c): Card => {
    const card: Card = {
      ...c, ...languageFields(c), frontImage: image(c.frontImage), backImage: image(c.backImage),
    };
    if ((!card.frontText.trim() && !card.frontImage) || (!card.backText.trim() && !card.backImage)) fail('表面または裏面が空のカードがあります。');
    return card;
  });
  return { cards, tags: data.tags, decks: data.decks, reviews: data.reviews };
}

export function downloadBackup(blob: Blob, filename = `pocket-flash-cards-${new Date().toISOString().slice(0, 10)}.zip`) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give Safari enough time to hand the Blob to its download manager.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
