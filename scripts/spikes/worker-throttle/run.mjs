// scripts/spikes/worker-throttle/run.mjs
/*
 * SPIKE — does a dedicated Web Worker keep ticking while its tab is hidden?
 *
 * The bot engine runs in a worker inside the instructor's tab. The moment the
 * instructor switches to a watch tab, that tab is hidden, and Chrome throttles
 * hidden pages: after ~5 minutes "intensive throttling" limits main-thread timer
 * chains to roughly one wake-up per minute. If a worker suffers the same, bots
 * would crawl exactly when someone is watching them.
 *
 * Two counters tick once a second: one on the main thread (the CONTROL — it must
 * slow down, or throttling never engaged and the run proves nothing) and one in
 * a worker (the SUBJECT).
 *
 * Playwright launches Chromium with background throttling switched OFF. Those
 * flags are removed below; without that, every run would "pass".
 *
 * Usage: node scripts/spikes/worker-throttle/run.mjs     (SPIKE_MINUTES=7 default)
 */
import { chromium } from '@playwright/test';

const MINUTES = Number(process.env.SPIKE_MINUTES ?? 7);
const ORIGIN = 'http://spike.local/';
const PAGE = `<!doctype html><html><body><script>
  window.mainTicks = 0; window.workerTicks = 0; window.hiddenSeen = false;
  setInterval(() => { window.mainTicks++; }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.hiddenSeen = true;
  });
  const src = 'let n = 0; setInterval(() => postMessage(++n), 1000);';
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = e => { window.workerTicks = e.data; };
</script></body></html>`;

const browser = await chromium.launch({
  headless: false,
  ignoreDefaultArgs: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const context = await browser.newContext();
await context.route(`${ORIGIN}**`, route => route.fulfill({ contentType: 'text/html', body: PAGE }));

const botHost = await context.newPage();
await botHost.goto(ORIGIN);
const watcher = await context.newPage();
await watcher.goto('about:blank');
await watcher.bringToFront();

console.log(`bot-host tab is behind another tab; waiting ${MINUTES} minute(s)…`);
await watcher.waitForTimeout(MINUTES * 60_000);

const r = await botHost.evaluate(() => ({
  main: window.mainTicks,
  worker: window.workerTicks,
  hiddenSeen: window.hiddenSeen,
}));
await browser.close();

const expected = MINUTES * 60;
const pct = n => Math.round((100 * n) / expected);
console.log(`expected ≈${expected} ticks · main thread ${r.main} (${pct(r.main)}%) · worker ${r.worker} (${pct(r.worker)}%)`);

if (!r.hiddenSeen) {
  console.log('INCONCLUSIVE: the bot-host tab never became hidden.');
  process.exit(2);
}
if (pct(r.main) >= 90) {
  console.log('INCONCLUSIVE: the main-thread control was not throttled, so throttling never engaged.');
  process.exit(2);
}
if (pct(r.worker) >= 90) {
  console.log('PASS: main thread was throttled, the worker kept pace.');
  process.exit(0);
}
console.log('FAIL: the worker was throttled too.');
process.exit(1);
