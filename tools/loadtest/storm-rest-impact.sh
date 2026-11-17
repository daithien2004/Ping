#!/usr/bin/env bash
# REST có chậm đi khi bão reconnect chạy CÙNG process không? (câu hỏi của B4: có đáng tách gateway không)
# Một instance native; rest-history chạy một mình hoặc chồng lên reconnect-storm. Cần `pnpm build`, seed ping_load, k6.
#   bash tools/loadtest/storm-rest-impact.sh <nhãn> <storm 0|1> <PRESENCE_BATCH_MS> <PRESENCE_SCOPED> <WATCH>
# Kết quả ở tools/loadtest/data/impact-<nhãn>/ (git bỏ qua).
set -u
cd "$(dirname "$0")/../.."
label=$1 storm=$2 batch=$3 scoped=$4 watch=${5:-0}
sockets=${SOCKETS:-300}
rate=${RATE:-40} # vòng lặp/giây, mỗi vòng ~5 request: 40 ≈ 210 request/giây, dưới trần ~260 của một instance
out=tools/loadtest/data/impact-$label
mkdir -p "$out"

stop_port() {
  local pid
  pid=$(netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$pid" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1
}

# Lần khởi động đầu sau khi máy rảnh đôi khi quá 30 giây của run-instances: thử lại một lần.
launcher=""
for attempt in 1 2; do
  PRESENCE_BATCH_MS=$batch PRESENCE_SCOPED=$scoped node tools/loadtest/run-instances.mjs 1 >"$out/instance.log" 2>&1 &
  launcher=$!
  for _ in $(seq 1 90); do grep -q "^ready:" "$out/instance.log" && break; sleep 1; done
  grep -q "^ready:" "$out/instance.log" && break
  kill "$launcher" 2>/dev/null
  stop_port 4001
  stop_port 9101
done
if ! grep -q "^ready:" "$out/instance.log"; then
  echo "instance chưa sẵn sàng, xem $out/instance.log"
  exit 1
fi

storm_pid=""
if [ "$storm" = "1" ]; then
  k6 run tools/loadtest/reconnect-storm.js -e PORTS=4001 -e SOCKETS="$sockets" -e ROUNDS=3 -e HOLD_S=15 \
    -e WATCH="$watch" --summary-export="$out/storm.json" >"$out/storm.log" 2>&1 &
  storm_pid=$!
  sleep 12
fi

k6 run tools/loadtest/rest-history.js -e PORTS=4001 -e RATE="$rate" -e DURATION=40s \
  --summary-export="$out/rest.json" >"$out/rest.log" 2>&1
echo "rest k6 exit=$?"
[ -n "$storm_pid" ] && wait "$storm_pid"
curl -s http://127.0.0.1:9101/metrics >"$out/metrics-after.txt"
kill "$launcher" 2>/dev/null
stop_port 4001
stop_port 9101

echo "nhãn=$label storm=$storm batch=$batch scoped=$scoped watch=$watch sockets=$sockets rate=$rate"
node tools/loadtest/summarize.mjs "$out/rest.json" | grep -E "http_req_duration |requests/s|http_req_failed|dropped"
node -e "
const m = require('./$out/rest.json').metrics;
const d = m.http_req_duration;
console.log('http_req_duration p99', d['p(99)']?.toFixed?.(0) ?? 'n/a', 'ms');
"
grep -E '^nodejs_eventloop_lag_p99_seconds ' "$out/metrics-after.txt" | awk '{printf "event loop lag p99 (từ lúc process chạy): %.0f ms\n", $2*1000}'
