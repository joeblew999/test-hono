import { defineConfig } from '@playwright/test';
import { DEFAULT_BASE_URL } from './constants';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/screenshots.spec.ts', '**/sync-demo.spec.ts'],
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || DEFAULT_BASE_URL,
    headless: false,
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 },
    },
  },
  outputDir: './docs/videos',
});
