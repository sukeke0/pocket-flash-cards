import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import license from 'rollup-plugin-license';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = env.VITE_BASE_PATH || '/';
  const base = `/${raw.split('/').filter(Boolean).join('/')}${raw === '/' ? '' : '/'}`;
  return {
    base,
    plugins: [svelte(), license({ thirdParty: { output: resolve('dist/licenses/dependencies.txt') } }), VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        id: base, name: 'Pocket Flash Cards', short_name: 'Pocket Flash Cards', lang: 'ja',
        description: 'タグで整理する、自分だけのフラッシュカード。',
        start_url: base, scope: base, display: 'standalone',
        background_color: '#f8f9fc', theme_color: '#f8f9fc',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}', 'licenses/*.txt'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    })],
  };
});
