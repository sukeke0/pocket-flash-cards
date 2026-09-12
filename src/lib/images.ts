import imageCompression from 'browser-image-compression';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 200_000;
const MAX_EDGE = 1600;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function readImage(file: File): Promise<Blob> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('JPEG・PNG・WebP・GIF画像を選択してください。HEICはJPEGに変換してください。');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('画像は1枚10MB以内にしてください。');
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    try { await img.decode(); }
    catch { throw new Error('この画像を読み込めませんでした。'); }
    if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('画像の画素数が大きすぎます。4,000万画素以下に縮小してください。');
    if (file.size < TARGET_IMAGE_BYTES && Math.max(img.naturalWidth, img.naturalHeight) <= MAX_EDGE) return file;
    const result = await imageCompression(file, {
      maxSizeMB: (TARGET_IMAGE_BYTES - 1) / (1024 * 1024),
      maxWidthOrHeight: MAX_EDGE, fileType: 'image/webp', initialQuality: 0.88,
      // The library's worker default can fetch code from a CDN. Keep all code
      // in the Vite bundle so compression also works offline under a base path.
      useWebWorker: false, preserveExif: false,
    });
    if (result.size >= TARGET_IMAGE_BYTES) throw new Error('200KB未満に圧縮できませんでした。画像を切り抜いて再度選択してください。');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
