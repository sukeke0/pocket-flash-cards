import type { Snapshot } from './models';

export function measureData(snapshot: Snapshot) {
  let imageBytes = 0;
  let imageCount = 0;
  for (const card of snapshot.cards) for (const blob of [card.frontImage, card.backImage]) {
    if (blob) { imageCount++; imageBytes += blob.size; }
  }
  // Logical UTF-8 size, excluding blobs. IndexedDB indexes/overhead are browser-specific.
  const recordBytes = new TextEncoder().encode(JSON.stringify(snapshot, (_key, value: unknown) => value instanceof Blob ? null : value)).byteLength;
  return { imageBytes, imageCount, recordBytes, totalBytes: imageBytes + recordBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = bytes / 1000;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) { amount /= 1000; unit++; }
  return `${amount.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
