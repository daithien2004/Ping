import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence = new URL('../../../docs/v0.2.0/evidence/T5.11/', import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1250 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const alerts = await (await fetch('http://localhost:19090/api/v1/alerts')).json();
  const warning = alerts.data.alerts.find(
    (alert) => alert.labels.alertname === 'PingAiBudgetWarning',
  );
  if (warning?.state !== 'firing')
    throw new Error(`Expected firing budget warning, got ${warning?.state}`);
  await writeFile(new URL('alert-firing.json', evidence), JSON.stringify(alerts, null, 2) + '\n');
  await page.goto('http://localhost:13030/d/ping-ai?from=now-15m&to=now&refresh=15s', {
    waitUntil: 'networkidle',
  });
  await page.getByText('Daily AI spend (UTC)', { exact: true }).waitFor();
  await page.waitForTimeout(5_000);
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.textContent =
      'SYNTHETIC LOCAL DRILL: mocked spending 8.1 / 10 USD; no real provider calls';
    banner.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:10px;background:#7a4400;color:white;text-align:center;font:16px sans-serif';
    document.body.append(banner);
  });
  await page.screenshot({
    path: new URL('dashboard-synthetic.png', evidence).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    fullPage: true,
  });
  await page.goto('http://localhost:19090/alerts', { waitUntil: 'domcontentloaded' });
  await page.getByText('PingAiBudgetWarning', { exact: false }).first().waitFor();
  await page.screenshot({
    path: new URL('alert-firing.png', evidence).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    fullPage: true,
  });
  await writeFile(
    new URL('browser-check.json', evidence),
    JSON.stringify({ pageErrors: errors, warningState: warning.state, synthetic: true }, null, 2) +
      '\n',
  );
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Dashboard and firing alert captured; no browser page errors. Synthetic drill only.');
} finally {
  await browser.close();
}
