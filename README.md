# Pocket Flash Cards

[Open Pocket Flash Cards](https://pocket-flash-cards.pages.dev/)

A mobile-first flashcard PWA built with Svelte, TypeScript, Vite, and Dexie. Organize text and image cards with tags and decks, study with spaced repetition, and track progress. Supports speech playback, CSV/TSV and image ZIP imports, ZIP backups, and offline use. No backend or account required.

## Development

Requires Node.js 24 and pnpm 11.19.0.

```sh
git clone https://github.com/sukeke0/pocket-flash-cards.git
cd pocket-flash-cards
pnpm install --frozen-lockfile
pnpm dev
```

## Build

```sh
pnpm build
pnpm preview
```

Deploy `dist/` to an HTTPS site. On Cloudflare Pages, use production branch `main`, framework preset `None`, build command `pnpm build`, and output directory `dist`. Leave the root directory empty and set `NODE_VERSION=24.19.0` and `PNPM_VERSION=11.19.0`. For subdirectory deployments, set `VITE_BASE_PATH` before building.

Offline support is enabled in production builds after the first successful online load. Cards, images, and review history stay in the browser's IndexedDB. Use ZIP backups to move data between devices or URLs; restoring a backup replaces existing data.

## Tests

```sh
pnpm check
pnpm test
pnpm build
pnpm test:browser
```

Browser tests use an installed Google Chrome locally; CI installs Chromium automatically.

## License

The application source has no license specified yet. Third-party license notices are available in `public/licenses/` and generated in `dist/licenses/dependencies.txt` during the build.
