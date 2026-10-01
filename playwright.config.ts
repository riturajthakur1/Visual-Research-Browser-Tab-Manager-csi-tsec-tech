import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  // Traces record the whole flow, so they are opt-in: E2E_TRACE=1 npm run test:e2e
  use: { trace: process.env.E2E_TRACE === '1' ? 'retain-on-failure' : 'off' },
});
