import { expect, type Page } from '@playwright/test';
import type { Card, Review } from '../src/lib/models';

export async function start(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Pocket Flash Cards', exact: true })).toBeVisible();
}

export async function importText(page: Page, source: string, count: number) {
  await page.getByRole('navigation').getByRole('link', { name: 'カード', exact: true }).click();
  await page.getByRole('button', { name: 'CSV／TSVを貼り付けて追加' }).click();
  const dialog = page.getByRole('dialog', { name: 'まとめてカードを追加' });
  await dialog.getByLabel('CSV／TSVを貼り付け', { exact: true }).fill(source);
  await dialog.getByRole('button', { name: '取り込み内容を確認' }).click();
  await expect(dialog.getByRole('heading', { name: `${count}枚を追加できます` })).toBeVisible();
  await dialog.getByRole('button', { name: `${count}枚のカードを追加`, exact: true }).click();
  await expect(dialog).toBeHidden();
}

// Read only this test's disposable browser database, through the standard IDB API.
export async function storedData(page: Page) {
  return page.evaluate(async base => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`pocket-cards:${base}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(['cards', 'reviews']);
      const read = <T>(name: string) => new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
      const [cards, reviews] = await Promise.all([read<Card>('cards'), read<Review>('reviews')]);
      const image = async (blob: Blob | null) => blob ? { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] } : null;
      return { cards: await Promise.all(cards.map(async card => ({ ...card, frontImage: await image(card.frontImage), backImage: await image(card.backImage) }))), reviews };
    } finally { db.close(); }
  }, process.env.VITE_BASE_PATH || '/');
}
