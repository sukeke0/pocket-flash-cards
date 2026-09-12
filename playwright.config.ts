import { defineConfig } from '@playwright/test';

const base = process.env.VITE_BASE_PATH || '/';
export default defineConfig({
  testDir: './e2e', timeout: 60_000, fullyParallel: true,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:4175${base}`,
    browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm preview --port 4175 --strictPort',
    url: `http://127.0.0.1:4175${base}`, reuseExistingServer: false,
  },
});
