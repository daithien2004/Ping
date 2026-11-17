// Exporter giả cho alert-drill: 20 request/giây, 10% trả 5xx, mọi request dưới 0,5 giây. Chạy trong mạng compose của drill.
import http from 'node:http';

let total = 0;
let errors = 0;
setInterval(() => {
  total += 20;
  errors += 2;
}, 1000);
http
  .createServer((_req, res) => {
    res.setHeader('content-type', 'text/plain; version=0.0.4');
    const ok = total - errors;
    const count = (cls, n) =>
      `http_request_duration_seconds_count{method="GET",route="/x",status_class="${cls}"} ${n}\n`;
    const bucket = (le, cls, n) =>
      `http_request_duration_seconds_bucket{method="GET",route="/x",status_class="${cls}",le="${le}"} ${n}\n`;
    res.end(
      count('2xx', ok) +
        count('5xx', errors) +
        bucket('0.5', '2xx', ok) +
        bucket('+Inf', '2xx', ok) +
        bucket('0.5', '5xx', errors) +
        bucket('+Inf', '5xx', errors),
    );
  })
  .listen(19100);
