import { defineConfig } from '@playwright/test';
import { DEFAULT_BASE_URL } from './constants';

const headed = process.env.HEADED !== '0';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/screenshots.spec.ts'],
  workers: headed ? 1 : 2,
  use: {
    baseURL: process.env.BASE_URL || DEFAULT_BASE_URL,
    headless: !headed,
  },
});
