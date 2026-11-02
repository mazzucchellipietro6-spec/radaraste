// Test end-to-end (Playwright). Guida completa in README.md, sezione "Test".
//   npm test                        -> pagine pubbliche (nessun servizio esterno richiesto)
//   E2E_DB=1 npm test               -> anche prenotazioni, registrazione, area clienti e pannello
//                                      (servono il Postgres di prova e il finto servizio di accesso:
//                                       vedi tests/support/mock-gotrue.mjs)
//   E2E_BASE_URL=http://localhost:4400 npm test -> usa un server già avviato
import { defineConfig, devices } from '@playwright/test';

const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'it-IT',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: [
    ...(external
      ? []
      : [{ command: `npx astro dev --port ${port}`, url: `http://localhost:${port}/it/`, reuseExistingServer: true, timeout: 120_000 }]),
    // finto servizio di accesso, solo per i test con database
    ...(process.env.E2E_DB
      ? [{ command: 'node tests/support/mock-gotrue.mjs', url: 'http://localhost:54330/auth/v1/health', reuseExistingServer: true, timeout: 30_000 }]
      : []),
  ],
});
