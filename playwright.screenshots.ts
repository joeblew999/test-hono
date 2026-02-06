import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/screenshots.spec.ts'],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8787',
    viewport: { width: 1280, height: 800 },
  },
});
