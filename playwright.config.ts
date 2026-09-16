import { defineConfig, devices } from '@playwright/test';

/**
 * Layer 3 of the e2e suite: the real-browser layer.
 *
 * This suite drives an ALREADY-DEPLOYED site (Azure Static Web Apps, built
 * against the live Azure backend). There is deliberately NO `webServer` block:
 * starting a local Vite dev server here would silently test a different bundle
 * than the one students actually load, and would point at whatever
 * `.env.local` happens to say rather than the deployed configuration.
 *
 * Everything environment-specific is read from env vars so a parent
 * orchestrator can own credentials and round setup:
 *
 *   E2E_FE_URL           deployed frontend origin (default: the Azure SWA site)
 *   E2E_BE_URL           deployed backend origin (default: the Azure API)
 *   E2E_ADMIN_PASSWORD   instructor password — REQUIRED, never hardcoded
 *   E2E_INSTRUCTOR_NAME  instructor display name
 *   E2E_JM_MEMBER_1/2    the Joke Maker pair's two member names
 *   E2E_MK_MEMBER_1/2    the Marketing pair's two member names
 *   E2E_HEADED=1         run with a visible browser
 *   E2E_SLOWMO           ms of slow-motion, for watching a run
 */

const FE_URL =
  process.env.E2E_FE_URL ?? 'https://kind-sky-0ccf01e0f.3.azurestaticapps.net';

const headed = process.env.E2E_HEADED === '1' || process.env.E2E_HEADED === 'true';
const slowMo = Number(process.env.E2E_SLOWMO ?? 0) || 0;

export default defineConfig({
  testDir: './scripts/e2e/browser',
  testMatch: /.*\.spec\.ts$/,

  /* The flow waits on a live LLM classification round-trip and on a 2.5s
     frontend poll loop, so a per-test budget in the low minutes is normal
     rather than a smell. Individual waits set their own tighter budgets. */
  timeout: 5 * 60 * 1000,
  expect: {
    /* Generous enough to cover one or two poll cycles for any single
       assertion; the polling-latency assertions override this explicitly. */
    timeout: 20 * 1000,
  },

  /* One shared live backend + a destructive DB reset owned by the
     orchestrator means parallel workers would fight over the same round. */
  fullyParallel: false,
  workers: 1,

  /* A live-network flake is worth exactly one retry in CI; locally a failure
     should fail immediately so the operator sees it. */
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  outputDir: 'test-results',

  use: {
    baseURL: FE_URL,
    headless: !headed,

    /* Artifacts only for failures — a green run leaves nothing behind. */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 15 * 1000,
    navigationTimeout: 45 * 1000,

    /* The deployed SPA is served over https with a real certificate. */
    ignoreHTTPSErrors: false,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: slowMo ? { slowMo } : undefined,
        /* Wide enough that the Marketing desk's lg: three-column grid and the
           instructor's team columns render in their desktop form. */
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
