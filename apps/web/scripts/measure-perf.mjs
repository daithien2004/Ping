// TF.15: đo LCP/CLS/INP (lab, Chromium) trên landing và trang chat, bản build production.
// Chạy khi API (4000) + web (3000, `next start`) đã lên và DB đã seed:
//   pnpm --filter web exec node scripts/measure-perf.mjs
// Số đo là phòng thí nghiệm trên một máy, không thay dữ liệu hiện trường (RUM).
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const WEB = process.env.PERF_WEB_URL ?? 'http://localhost:3000';
const API = process.env.PERF_API_URL ?? 'http://localhost:4000/api/v1';
const SERVER_ID = '01990000-0000-7000-8000-000000000100';
const CHANNEL_ID = '01990000-0000-7000-8000-000000000401';
const RUNS = Number(process.env.PERF_RUNS ?? 2);

const OBSERVE = () => {
  window.__vitals = { lcp: 0, cls: 0, shifts: 0, events: [], longTasks: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__vitals.lcp = Math.max(window.__vitals.lcp, entry.startTime);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        window.__vitals.cls += entry.value;
        window.__vitals.shifts += 1;
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
  // INP thật là p98 của event duration; ở đây lấy độ trễ lớn nhất trong các tương tác chủ động
  // (đo trên máy, số mẫu ít) — ghi rõ là xấp xỉ, không thay RUM.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__vitals.events.push(entry.duration);
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  new PerformanceObserver((list) => {
    window.__vitals.longTasks += list.getEntries().length;
  }).observe({ type: 'longtask', buffered: true });
};

async function readVitals(page) {
  const raw = await page.evaluate(() => {
    // PerformanceObserver có thể chưa kịp giao entry LCP ở lượt đầu; đọc thẳng buffer của
    // performance timeline để không ghi nhầm 0 ms.
    const entries = performance.getEntriesByType('largest-contentful-paint');
    const fromTimeline = entries.length ? Math.max(...entries.map((entry) => entry.startTime)) : 0;
    return { ...window.__vitals, lcp: Math.max(window.__vitals.lcp, fromTimeline) };
  });
  const durations = [...raw.events].sort((a, b) => b - a);
  return {
    lcp: Math.round(raw.lcp),
    cls: Number(raw.cls.toFixed(4)),
    shifts: raw.shifts,
    inp: durations.length ? Math.round(durations[0]) : 0,
    events: durations.length,
    longTasks: raw.longTasks,
    slowestEvents: durations.slice(0, 5).map((value) => Math.round(value)),
  };
}

async function measureLanding(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(OBSERVE);
  const page = await context.newPage();
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  // Chờ hydrate xong rồi mới bấm: bấm ngay sau networkidle có lượt không phát sinh event timing.
  await page.waitForTimeout(1000);
  // Tương tác chủ động để có mẫu INP: bấm CTA nhưng chặn điều hướng ở capture để LCP/CLS
  // vẫn là của trang landing (sang /login sẽ reset window.performance).
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('button')) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  });
  const loginButton = page.getByRole('button', { name: 'Đăng nhập' }).first();
  await loginButton.click();
  // Lượt chạy nóng đôi khi không phát sinh event timing cho cú bấm đầu; bấm lại và chờ có mẫu.
  const gotEvent = await page
    .waitForFunction(() => window.__vitals.events.length > 0, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!gotEvent) await loginButton.click();
  await page.waitForTimeout(2500);
  const vitals = await readVitals(page);
  await context.close();
  return vitals;
}

async function measureChat(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(OBSERVE);
  const login = await context.request.post(`${API}/auth/login`, {
    data: { email: 'alice@ping.dev', password: 'password123' },
  });
  if (!login.ok()) throw new Error(`Đăng nhập API lỗi HTTP ${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${WEB}/servers/${SERVER_ID}/channels/${CHANNEL_ID}`, {
    waitUntil: 'networkidle',
  });
  await page.getByTestId('message-scroll').waitFor();
  await page.getByText('Welcome to Ping! 🏓').waitFor();
  // Tương tác: gõ vào ô soạn tin (không gửi), mở search (chunk tải lười), mở quick switcher.
  const composer = page.getByTestId('message-composer');
  await composer.fill('Đo hiệu năng gõ phím trên trang chat');
  await composer.fill('');
  await page.getByRole('button', { name: 'Tìm trong server' }).click();
  await page.getByTestId('search-input').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.getByTestId('quick-switcher-input').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
  const vitals = await readVitals(page);
  await context.close();
  return vitals;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const health = await fetch('http://localhost:4000/api/v1/health').catch(() => null);
if (!health?.ok) throw new Error('API :4000 chưa chạy hoặc /health không xanh.');
const web = await fetch(WEB).catch(() => null);
if (!web?.ok) throw new Error(`Web ${WEB} chưa chạy (cần "next start" bản production).`);

const browser = await chromium.launch();
const browserVersion = browser.version();
const landing = [];
const chat = [];
for (let run = 0; run < RUNS; run += 1) {
  landing.push(await measureLanding(browser));
  chat.push(await measureChat(browser));
}
await browser.close();

const report = {
  measuredAt: new Date().toISOString(),
  environment: {
    web: WEB,
    build: 'production (next build + next start)',
    viewport: '1280x800',
    browser: `Chromium ${browserVersion}`,
    runs: RUNS,
    note: 'Số đo lab trên một máy; INP là event duration lớn nhất (xấp xỉ p98), không thay RUM.',
  },
  landing,
  chat,
  median: {
    landing: {
      lcp: median(landing.map((item) => item.lcp)),
      cls: median(landing.map((item) => item.cls)),
      inp: median(landing.map((item) => item.inp)),
    },
    chat: {
      lcp: median(chat.map((item) => item.lcp)),
      cls: median(chat.map((item) => item.cls)),
      inp: median(chat.map((item) => item.inp)),
    },
  },
};
await writeFile('perf-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
