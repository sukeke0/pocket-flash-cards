// Generate app icons from the same Font Awesome Free Solid clone symbol used in the UI.
import { faClone } from '@fortawesome/free-solid-svg-icons';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = new URL('../public/', import.meta.url);
const [width, height, , , path] = faClone.icon;
const paths = typeof path === 'string' ? [path] : path;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!-- Font Awesome Free by Fonticons, Inc. CC BY 4.0; see licenses/font-awesome.txt. Background and placement by Pocket Flash Cards. --><rect width="512" height="512" fill="#2873cf"/><svg x="112" y="112" width="288" height="288" viewBox="0 0 ${width} ${height}" fill="white">${paths.map(d => `<path d="${d}"/>`).join('')}</svg></svg>`;
await mkdir(new URL('icons/', root), { recursive: true });
await mkdir(new URL('licenses/', root), { recursive: true });
await writeFile(new URL('favicon.svg', root), svg);
const license = await readFile(join(dirname(require.resolve('@fortawesome/free-solid-svg-icons')), 'LICENSE.txt'), 'utf8');
await writeFile(new URL('licenses/font-awesome.txt', root), `Pocket Flash Cards uses Font Awesome Free Solid icons by Fonticons, Inc.\nhttps://fontawesome.com/\nhttps://github.com/FortAwesome/Font-Awesome\n\nThe original icon paths are unchanged. App icons add a blue background and placement.\n\n${license}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['maskable-512', 512], ['apple-touch-icon', 180]]) {
    const png = await page.evaluate(async ({ svg, size }) => {
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, size });
    await writeFile(new URL(`icons/${name}.png`, root), Buffer.from(png, 'base64'));
  }
} finally { await browser.close(); }
console.log('Generated Font Awesome app icons and license notice.');
