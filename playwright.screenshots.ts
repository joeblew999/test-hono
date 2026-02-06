import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/screenshots.spec.ts'],
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8787',
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: 'tablet',
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
