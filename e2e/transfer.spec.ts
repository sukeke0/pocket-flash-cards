import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { start, importText, storedData } from './helpers';

test('large transparent images compress offline, survive review and backup restoration', async ({ page, context }, testInfo) => {
  await start(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // A reloaded page is controlled by the installed worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  for (const filename of ['dependencies.txt', 'font-awesome.txt', 'uzip.txt']) {
    expect(await page.evaluate(async path => (await fetch(`licenses/${path}`)).ok, filename)).toBe(true);
  }
  await page.getByRole('link', { name: 'カード', exact: true }).click();
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(1800, 600);
    let seed = 9;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let c = 0; c < 3; c++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels.data[i + c] = seed >>> 24; }
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); ctx.clearRect(0, 0, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const buffer = Buffer.from(source, 'base64');
  expect(buffer.length).toBeGreaterThan(200_000);
  await page.getByRole('button', { name: 'カードを追加', exact: true }).click();
  await page.getByPlaceholder('例：ubiquitous').fill('圧縮テスト');
  await page.getByPlaceholder('例：至るところにある').fill('画像の裏面');
  await page.getByLabel('表面の画像を選択', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer });
  await page.getByLabel('裏面の画像を選択', { exact: true }).setInputFiles('public/icons/icon-192.png');
  await page.getByRole('button', { name: 'カードを保存' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const original = (await storedData(page)).cards.find(card => card.frontText === '圧縮テスト')!;
  expect(original.frontImage!.bytes.length).toBeLessThan(200_000);
  const dimensions = await page.evaluate(async image => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], { type: image.type }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
    const result = { width: bitmap.width, height: bitmap.height, alpha: ctx.getImageData(0, 0, 1, 1).data[3] };
    bitmap.close(); return result;
  }, original.frontImage!);
  expect(dimensions.width).toBeLessThanOrEqual(1600);
  expect(dimensions.width / dimensions.height).toBeCloseTo(3, 1);
  expect(dimensions.alpha).toBe(0);
  await page.getByRole('link', { name: 'デッキ', exact: true }).click();
  await page.getByRole('button', { name: 'デッキを作成', exact: true }).click();
  await page.getByLabel('デッキ名', { exact: true }).fill('画像');
  await page.getByRole('button', { name: '1枚ずつ選ぶ', exact: true }).click();
  await page.getByRole('checkbox', { name: '圧縮テストをデッキに含める' }).check();
  await page.getByRole('button', { name: 'デッキを保存' }).click();
  await page.getByRole('button', { name: '画像の学習設定' }).click();
  await page.getByRole('button', { name: '学習を始める', exact: true }).click();
  await page.getByRole('button', { name: '裏面を見る', exact: true }).click();
  await page.getByRole('button', { name: '余裕', exact: true }).click();
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await page.getByRole('link', { name: 'カード', exact: true }).click();
  const afterReview = (await storedData(page)).cards.find(card => card.id === original.id)!;
  expect(afterReview.frontImage).toEqual(original.frontImage);
  expect(afterReview.backImage).toEqual(original.backImage);
  expect(afterReview.reviewCount).toBe(1);
  await page.getByRole('searchbox', { name: 'カードを検索', exact: true }).fill('圧縮テスト');
  await expect(page.locator('.card-open img')).toBeVisible();
  expect(await page.locator('.card-open img').evaluate(async img => { await (img as HTMLImageElement).decode(); return (img as HTMLImageElement).naturalWidth > 0; })).toBe(true);
  await page.getByRole('link', { name: 'その他', exact: true }).click();
  const saved = await storedData(page);
  await page.getByRole('button', { name: 'すべてのデータをZIPで保存' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIPをダウンロード', exact: true }).click();
  const backupPath = testInfo.outputPath('backup.zip');
  await (await downloading).saveAs(backupPath);
  await importText(page, 'later\t復元で消えるカード', 1);
  await page.getByRole('link', { name: 'その他', exact: true }).click();
  await page.getByLabel('バックアップから復元', { exact: true }).setInputFiles(backupPath);
  await page.getByRole('button', { name: '現在のデータを置き換えて復元' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await storedData(page)).toEqual(saved);
  await page.reload();
  expect(await storedData(page)).toEqual(saved);
});

test('ZIP with images is additive and invalid backup cannot overwrite existing data', async ({ page }) => {
  await start(page);
  const before = await storedData(page);
  const buffer = Buffer.from(zipSync({
    'cards.csv': strToU8('front,back,frontImage,backImage,tags,frontLanguage,backLanguage\nzip-card,猫,cat.png,cat.png,"英語,動物",en-US,ja-JP'),
    'images/cat.png': new Uint8Array(await readFile('public/icons/icon-192.png')),
  }));
  await page.getByRole('link', { name: 'その他', exact: true }).click();
  await page.getByRole('button', { name: 'ZIPで一括登録', exact: true }).click();
  await page.getByLabel('追加用ZIPを選択').setInputFiles({ name: 'cards.zip', mimeType: 'application/zip', buffer });
  await page.getByRole('button', { name: '1枚を新しいカードとして追加' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const after = await storedData(page);
  expect(after.cards).toHaveLength(before.cards.length + 1);
  expect(after.reviews).toEqual(before.reviews);
  expect(after.cards.find(card => card.frontText === 'zip-card')).toMatchObject({ frontLanguage: 'en-US', backLanguage: 'ja-JP' });
  await page.getByLabel('バックアップから復元').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'data.json': strToU8('{"schemaVersion":999}') })) });
  await expect(page.getByRole('alert')).toContainText('schemaVersion');
  expect(await storedData(page)).toEqual(after);
});
