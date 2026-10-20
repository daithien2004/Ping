// Đọc file --summary-export của k6 và in các chỉ số chính, để dán vào báo cáo.
//   k6 run tools/loadtest/rest-history.js --summary-export=tools/loadtest/data/rest-1x.json ...
//   node tools/loadtest/summarize.mjs tools/loadtest/data/rest-1x.json
import { readFileSync } from 'node:fs';

const summary = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const metrics = summary.metrics;
const rows = [];
for (const [name, metric] of Object.entries(metrics)) {
  if (name.startsWith('http_req_duration{kind:') || name === 'http_req_duration') {
    rows.push(
      `${name.padEnd(42)} p50=${metric.med.toFixed(0)}ms p95=${metric['p(95)'].toFixed(0)}ms max=${metric.max.toFixed(0)}ms`,
    );
  }
  if (
    name.startsWith('delivery_latency_ms') ||
    name === 'socket_connect_ms' ||
    name === 'reconnect_ms'
  ) {
    rows.push(
      `${name.padEnd(42)} p50=${metric.med.toFixed(0)}ms p95=${metric['p(95)'].toFixed(0)}ms max=${metric.max.toFixed(0)}ms`,
    );
  }
}
const get = (name, field) => metrics[name]?.[field];
rows.push(`requests/s              ${get('http_reqs', 'rate')?.toFixed(0)}`);
rows.push(`http_req_failed         ${((get('http_req_failed', 'value') ?? 0) * 100).toFixed(3)}%`);
for (const counter of [
  'dropped_iterations',
  'messages_received',
  'join_failed',
  'send_failed',
  'socket_errors',
  'reconnect_failures',
  'joins_ok',
]) {
  if (metrics[counter]) rows.push(`${counter.padEnd(24)}${metrics[counter].count}`);
}
console.log(rows.join('\n'));
