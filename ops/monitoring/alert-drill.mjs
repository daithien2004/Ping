// Diễn tập cảnh báo thật: exporter giả báo 10% request 5xx → Prometheus đánh giá ops/alerts.yml → Alertmanager → webhook.
//   node ops/monitoring/alert-drill.mjs      (cần Docker; tự dựng và dọn project ping-alert-drill, dùng cổng 19090, 19093, 19094)
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const compose = (...args) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      'ping-alert-drill',
      '-f',
      path.join(dir, 'compose.yml'),
      '-f',
      path.join(dir, 'compose.drill.yml'),
      ...args,
    ],
    {
      stdio: 'pipe',
      encoding: 'utf8',
    },
  );

const received = [];
const sink = http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        received.push(JSON.parse(body));
      } catch {
        /* bỏ qua */
      }
      res.end('ok');
    });
  })
  .listen(19094);
void sink;

const started = Date.now();
try {
  compose('up', '-d', 'fake-exporter', 'prometheus', 'alertmanager');
  console.log('Prometheus và Alertmanager đã chạy; chờ cảnh báo (đốt nhanh cần for: 2m)...');
  let firing;
  while (Date.now() - started < 7 * 60_000 && !firing) {
    await new Promise((r) => setTimeout(r, 5000));
    firing = received
      .flatMap((r) => r.alerts ?? [])
      .find((a) => a.labels?.alertname === 'PingErrorBudgetFastBurn' && a.status === 'firing');
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const names = received.flatMap((r) =>
    (r.alerts ?? []).map((a) => `${a.labels?.alertname}:${a.status}`),
  );
  const prom = async (p) =>
    (
      await fetch(`http://127.0.0.1:19090/api/v1/${p}`)
        .then((r) => r.text())
        .catch((e) => String(e))
    ).slice(0, 1500);
  const ratio = await prom('query?query=' + encodeURIComponent('ping:http_error_ratio:rate5m'));
  const active = await prom('alerts');
  console.log(
    JSON.stringify(
      {
        delivered: Boolean(firing),
        seconds,
        alert: firing?.labels,
        payloads: received.length,
        names,
      },
      null,
      2,
    ),
  );
  if (!firing) console.log('ratio5m:', ratio);
  if (!firing) console.log('alerts:', active);
  process.exitCode = firing ? 0 : 1;
} finally {
  sink.close();
  try {
    compose('down', '-v');
  } catch {
    /* đã dọn */
  }
  process.exit(process.exitCode ?? 1);
}
