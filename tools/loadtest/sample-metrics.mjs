// Lấy mẫu metrics của các instance (H5, /metrics) mỗi vài giây trong lúc chạy k6, ghi CSV để đưa vào báo cáo.
//   node tools/loadtest/sample-metrics.mjs <nhãn> [cổng-metrics,...] [giây]
//   ví dụ: node tools/loadtest/sample-metrics.mjs fanout-3x 9101,9102,9103 5      (dừng bằng Ctrl+C)
// Cột: thời điểm, cổng, socket đang mở, độ trễ event loop p99 (ms), CPU tích lũy (giây), RSS (MB),
// tổng request, số request 5xx.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const label = process.argv[2] ?? 'run';
const ports = (process.argv[3] ?? '9101').split(',');
const everySeconds = Number(process.argv[4] ?? 5);
const dir = path.join(root, 'tools/loadtest/data');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `metrics-${label}.csv`);
writeFileSync(
  file,
  'time,port,ws_connections,eventloop_p99_ms,cpu_seconds,rss_mb,requests,requests_5xx\n',
);

const value = (text, name) => {
  const line = text.split('\n').find((l) => l.startsWith(`${name} `));
  return line ? Number(line.split(' ')[1]) : NaN;
};
const sum = (text, prefix, filter = () => true) =>
  text
    .split('\n')
    .filter((l) => l.startsWith(prefix) && filter(l))
    .reduce((total, l) => total + Number(l.split(' ').at(-1)), 0);

async function sample() {
  for (const port of ports) {
    try {
      const text = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
      const row = [
        new Date().toISOString(),
        port,
        value(text, 'ws_connections'),
        (value(text, 'nodejs_eventloop_lag_p99_seconds') * 1000).toFixed(1),
        value(text, 'process_cpu_seconds_total').toFixed(1),
        (value(text, 'process_resident_memory_bytes') / 1048576).toFixed(0),
        sum(text, 'http_request_duration_seconds_count'),
        sum(text, 'http_request_duration_seconds_count', (l) => l.includes('status_class="5xx"')),
      ];
      appendFileSync(file, `${row.join(',')}\n`);
    } catch {
      appendFileSync(file, `${new Date().toISOString()},${port},DOWN,,,,,\n`);
    }
  }
}

console.log(`sampling ${ports.join(', ')} every ${everySeconds}s -> ${file}`);
setInterval(sample, everySeconds * 1000);
void sample();
