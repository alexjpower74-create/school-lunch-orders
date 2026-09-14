// School Lunch Orders end-to-end suite. Lead-owned: slices ask the lead for changes in their report.
// Every spec runs against the real Worker (it serves app/public), started fresh by tests/start-worker.mjs on E2E_PORT with
// TEST_MODE=1. One worker: the specs share one D1 and reset it.
//   sl2:  E2E_PORT=8603 npx playwright test tests/staff
//   sl1:  E2E_PORT=8604 npx playwright test tests/family
//   lead: E2E_PORT=8608 npx playwright test tests/journey    QA: E2E_PORT=8609 npx playwright test
// E2E_WORKER_DIR points the server at a copy of worker/ (negative controls); default ../worker.
// Devices: parents on their own phones (390 wide, touch) or a laptop; kitchen and office on a laptop (1280); teachers on a phone.
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 8603)

export const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
}

const engines = ['chromium', 'webkit']

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: './tests/results',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/start-worker.mjs',
    url: `http://127.0.0.1:${PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { E2E_PORT: String(PORT), E2E_WORKER_DIR: process.env.E2E_WORKER_DIR || '' },
  },
  projects: engines.flatMap((e) => [
    { name: `${e}-390`, use: { browserName: e, ...DEVICES.phone } },
    { name: `${e}-1280`, use: { browserName: e, ...DEVICES.desktop } },
  ]),
})
