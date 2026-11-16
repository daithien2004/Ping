#!/usr/bin/env bash
# Một lần đo bão presence cho một cấu hình (cần `pnpm build`, seed ping_load, k6, Docker đang chạy).
#   bash tools/loadtest/storm-compare.sh <nhãn> <PRESENCE_BATCH_MS> <PRESENCE_SCOPED true|false> <WATCH>
# Kết quả ở tools/loadtest/data/storm-<nhãn>/ (git bỏ qua). Chỉ đổi MỘT thứ giữa hai lần so sánh.
set -u
cd "$(dirname "$0")/../.."
label=$1 batch=$2 scoped=$3 watch=${4:-0}
sockets=${SOCKETS:-500}
out=tools/loadtest/data/storm-$label
mkdir -p "$out"

stop_port() {
  local pid
  pid=$(netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$pid" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1
}

PRESENCE_BATCH_MS=$batch PRESENCE_SCOPED=$scoped node tools/loadtest/run-instances.mjs 1 >"$out/instance.log" 2>&1 &
launcher=$!
for _ in $(seq 1 90); do grep -q "^ready:" "$out/instance.log" && break; sleep 1; done
if ! grep -q "^ready:" "$out/instance.log"; then
  echo "instance chưa sẵn sàng, xem $out/instance.log"
  kill "$launcher" 2>/dev/null
  stop_port 4001
  exit 1
fi

curl -s http://127.0.0.1:9101/metrics >"$out/metrics-before.txt"
k6 run tools/loadtest/reconnect-storm.js -e PORTS=4001 -e SOCKETS="$sockets" -e ROUNDS=3 -e HOLD_S=15 \
  -e WATCH="$watch" --summary-export="$out/k6.json" >"$out/k6.log" 2>&1
echo "k6 exit=$?"
curl -s http://127.0.0.1:9101/metrics >"$out/metrics-after.txt"
kill "$launcher" 2>/dev/null
stop_port 4001
stop_port 9101

emitted() { grep -E '^presence_emitted_total ' "$1" | awk '{print $2}'; }
echo "nhãn=$label batch=$batch scoped=$scoped watch=$watch sockets=$sockets"
echo "presence_emitted_total trước=$(emitted "$out/metrics-before.txt") sau=$(emitted "$out/metrics-after.txt")"
node -e "
const m = require('./$out/k6.json').metrics;
const g = (n, k) => m[n]?.[k] ?? m[n]?.values?.[k];
console.log('presence_received', g('presence_received', 'count'));
console.log('ws_msgs_received', g('ws_msgs_received', 'count'));
console.log('reconnect_ms p95', g('reconnect_ms', 'p(95)'), 'med', g('reconnect_ms', 'med'));
console.log('failures', g('reconnect_failures', 'count'), 'connect_failed', g('connect_failed', 'count'),
  'join_failed', g('join_failed', 'count'), 'joins_ok', g('joins_ok', 'count'));
"
