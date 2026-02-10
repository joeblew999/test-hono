import { defineConfig } from '@playwright/test'
import { DEFAULT_BASE_URL } from './constants'

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/sync-demo.spec.ts'],
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || DEFAULT_BASE_URL,
    headless: false,
  },
})
