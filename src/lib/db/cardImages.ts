import Dexie from 'dexie';
import type { Card } from '../models';

// A Blob read from IndexedDB can retain a reference to a Safari-managed file.
// Rewriting that same reference may make it unreadable until a page reload.
// Copy actual bytes before overwriting the record; new Blob([oldBlob]) and slice()
// can share the same backing file and do not provide this isolation.
export async function copyCardImages<T extends Pick<Card, 'frontImage' | 'backImage'>>(card: T): Promise<T> {
  if (!card.frontImage && !card.backImage) return card;
  const copy = async (image: Blob | null): Promise<Blob | null> => {
    if (!image) return null;
    const bytes = await image.arrayBuffer();
    if (bytes.byteLength !== image.size) throw new Error('画像データを完全に読み取れませんでした。');
    return new Blob([bytes], { type: image.type });
  };
  try {
    // File reads are asynchronous non-IDB work. Keep the surrounding atomic
    // transaction alive, including the review/history duplicate checks.
    const [frontImage, backImage] = await Dexie.waitFor(Promise.all([copy(card.frontImage), copy(card.backImage)]));
    return { ...card, frontImage, backImage };
  } catch {
    throw new Error('画像を読み込めないため保存を中止しました。アプリを再読み込みして、もう一度お試しください。');
  }
}
