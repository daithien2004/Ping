// F14: cuộn lên đầu kênh 12.000 tin và đo long task. Cần API (4000) + web (3000, next start) trên ping_demo.
// pnpm --filter web exec node scripts/measure-scroll.mjs
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const WEB = process.env.F14_WEB_URL ?? 'http://localhost:3000';
const API = process.env.F14_API_URL ?? 'http://localhost:4000/api/v1';
const SERVER_ID = process.env.F14_SERVER_ID ?? '019b0000-0000-7000-8000-000000000021';
const CHANNEL_ID = process.env.F14_CHANNEL_ID ?? '019b0000-0000-7000-8000-000000000511';
const ITERATIONS = Number(process.env.F14_ITERATIONS ?? 200);

const OBSERVE = () => {
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
  }).observe({ type: 'longtask', buffered: true });
};

const percentile = (values, fraction) => {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);
  return values[index];
};

const health = await fetch('http://localhost:4000/api/v1/health').catch(() => null);
if (!health?.ok) throw new Error('API :4000 chưa chạy hoặc /health không xanh.');
const web = await fetch(WEB).catch(() => null);
if (!web?.ok) throw new Error(`Web ${WEB} chưa chạy (cần "next start" bản production).`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(OBSERVE);
const login = await context.request.post(`${API}/auth/login`, {
  data: { email: 'alice@ping.dev', password: 'password123' },
});
if (!login.ok()) throw new Error(`Đăng nhập API lỗi HTTP ${login.status()}`);

const page = await context.newPage();
await page.goto(`${WEB}/servers/${SERVER_ID}/channels/${CHANNEL_ID}`, { waitUntil: 'networkidle' });
const scroll = page.getByTestId('message-scroll');
await scroll.waitFor();
await page.waitForTimeout(1500);

const startedAt = Date.now();
let pagesLoaded = 0;
let stagnant = 0;
for (let i = 0; i < ITERATIONS; i += 1) {
  const before = await scroll.evaluate((element) => element.scrollHeight);
  const response = page
    .waitForResponse((candidate) => candidate.url().includes('/messages?before='), {
      timeout: 2500,
    })
    .catch(() => null);
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  const loaded = await response;
  if (loaded) {
    pagesLoaded += 1;
    stagnant = 0;
  } else {
    const grew = await page
      .waitForFunction(
        (height) => document.querySelector('[data-testid="message-scroll"]').scrollHeight > height,
        before,
        { timeout: 500 },
      )
      .then(() => true)
      .catch(() => false);
    if (!grew) {
      stagnant += 1;
      if (stagnant >= 5) break;
    }
  }
  await page.waitForTimeout(120);
}
const elapsedMs = Date.now() - startedAt;

const longTasks = await page.evaluate(() => window.__longTasks.slice().sort((a, b) => a - b));
const over50 = longTasks.filter((duration) => duration > 50);
const report = {
  measuredAt: new Date().toISOString(),
  environment: {
    web: WEB,
    build: 'production (next build + next start)',
    viewport: '1280x800',
    browser: `Chromium ${browser.version()}`,
    channel: CHANNEL_ID,
    iterationsRequested: ITERATIONS,
    pagesLoaded,
  },
  longTasks: {
    count: longTasks.length,
    over50ms: over50.length,
    max: Math.round(longTasks.at(-1) ?? 0),
    p95: Math.round(percentile(longTasks, 0.95)),
    totalMs: Math.round(longTasks.reduce((sum, duration) => sum + duration, 0)),
  },
  elapsedMs,
};
await browser.close();
await writeFile('f14-scroll-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
