// k6 run tools/loadtest/reconnect-storm.js -e PORTS=4001,4002 -e SOCKETS=1000 -e ROUNDS=3 -e HOLD_S=15
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { connect } from './lib/socketio.js';

const tokens = new SharedArray('tokens', () => JSON.parse(open('./data/tokens.json')));
const meta = JSON.parse(open('./data/meta.json'));
const PORTS = (__ENV.PORTS || '4001').split(',');
const SOCKETS = Number(__ENV.SOCKETS || 1000);
const ROUNDS = Number(__ENV.ROUNDS || 3);
const HOLD_MS = Number(__ENV.HOLD_S || 15) * 1000;

const recovery = new Trend('reconnect_ms', true);
const failures = new Counter('reconnect_failures');
const connectFailed = new Counter('connect_failed');
const joinFailed = new Counter('join_failed');
const joined = new Counter('joins_ok');

export const options = {
  scenarios: {
    storm: {
      executor: 'per-vu-iterations',
      vus: SOCKETS,
      iterations: 1,
      maxDuration: `${Math.ceil((HOLD_MS / 1000) * (ROUNDS + 1)) + 120}s`,
    },
  },
  thresholds: {
    reconnect_ms: ['p(95)<5000'],
    reconnect_failures: ['count<' + Math.max(1, Math.floor(SOCKETS * 0.01))],
  },
};

const xff = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

export default function () {
  const index = (__VU - 1) % tokens.length;
  const port = PORTS[index % PORTS.length];
  const channelId = meta.channels[index % meta.channels.length].id;
  let round = 0;
  let lostAt = 0;
  let closing = false;
  let ending = false;

  function open() {
    let opened = false;
    const client = connect(`http://127.0.0.1:${port}`, tokens[index].token, xff(index), {
      onOpen(socket) {
        opened = true;
        socket.emit('channel.join', { channelId }, (result) => {
          if (!result || !result.ok) {
            failures.add(1);
            joinFailed.add(1);
            return;
          }
          joined.add(1);
          if (lostAt) recovery.add(Date.now() - lostAt);
          lostAt = 0;
          setTimeout(() => {
            if (round >= ROUNDS) {
              ending = true;
              client.close();
              return;
            }
            round++;
            closing = true;
            lostAt = Date.now();
            client.close();
          }, HOLD_MS);
        });
      },
      onClose() {
        if (ending) return;
        if (!opened) {
          failures.add(1);
          connectFailed.add(1);
        }
        if (!lostAt) lostAt = Date.now();
        if (Date.now() - lostAt > 60000) return;
        closing = false;
        setTimeout(open, opened ? 0 : 1000);
      },
      onError() {},
    });
  }
  open();
}
