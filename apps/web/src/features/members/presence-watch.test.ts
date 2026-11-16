import { PRESENCE_WATCH_PER_SOCKET_MAX } from '@ping/shared';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimeSocket } from '@/features/realtime/socket';
import { PresenceWatcher } from './presence-watch';

const ids = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => `u${i + offset}`);

function fixture(connected = true) {
  const listeners = new Map<string, Set<() => void>>();
  const socket = {
    connected,
    on: vi.fn((event: string, fn: () => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
    }),
    off: vi.fn((event: string, fn: () => void) => listeners.get(event)?.delete(fn)),
    timeout: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  };
  const onOnline = vi.fn();
  const watcher = new PresenceWatcher(socket as unknown as RealtimeSocket, 's1', onOnline);
  const fire = (event: string) => listeners.get(event)?.forEach((fn) => fn());
  const calls = (name: string) =>
    socket.emit.mock.calls.filter((call) => call[0] === name).map((call) => call[1]);
  return { socket, watcher, onOnline, fire, calls };
}

describe('PresenceWatcher', () => {
  it('watches only new ids and unwatches only dropped ones', () => {
    const { watcher, calls } = fixture();
    watcher.set(['a', 'b']);
    watcher.set(['b', 'c']);
    expect(calls('presence.watch')).toEqual([
      { serverId: 's1', userIds: ['a', 'b'] },
      { serverId: 's1', userIds: ['c'] },
    ]);
    expect(calls('presence.unwatch')).toEqual([{ userIds: ['a'] }]);
  });

  it('splits into batches of at most 100 and caps one socket at 200 ids', () => {
    const { watcher, calls } = fixture();
    watcher.set(ids(PRESENCE_WATCH_PER_SOCKET_MAX + 50));
    const batches = calls('presence.watch') as { userIds: string[] }[];
    expect(batches.map((batch) => batch.userIds.length)).toEqual([100, 100]);
  });

  it('sends everything again after reconnect because the rooms were lost', () => {
    const { watcher, fire, calls, socket } = fixture();
    watcher.set(['a', 'b']);
    socket.emit.mockClear();
    fire('connect');
    expect(calls('presence.watch')).toEqual([{ serverId: 's1', userIds: ['a', 'b'] }]);
  });

  it('waits for the socket to connect before sending', () => {
    const { watcher, fire, calls, socket } = fixture(false);
    watcher.set(['a']);
    expect(socket.emit).not.toHaveBeenCalled();
    socket.connected = true;
    fire('connect');
    expect(calls('presence.watch')).toHaveLength(1);
  });

  it('reports the snapshot of online users from the ack', () => {
    const { watcher, socket, onOnline } = fixture();
    watcher.set(['a', 'b']);
    const ack = socket.emit.mock.calls[0]?.[2] as (e: null, r: unknown) => void;
    ack(null, { ok: true, online: ['b'] });
    expect(onOnline).toHaveBeenCalledWith(['b']);
  });

  it('retries ids whose watch failed on the next set', () => {
    const { watcher, socket, calls } = fixture();
    watcher.set(['a']);
    const ack = socket.emit.mock.calls[0]?.[2] as (e: Error | null, r?: unknown) => void;
    ack(new Error('timeout'));
    watcher.set(['a']);
    expect(calls('presence.watch')).toHaveLength(2);
  });

  it('unwatches everything and ignores late acks after dispose', () => {
    const { watcher, socket, calls, onOnline } = fixture();
    watcher.set(['a', 'b']);
    const ack = socket.emit.mock.calls[0]?.[2] as (e: null, r: unknown) => void;
    watcher.dispose();
    ack(null, { ok: true, online: ['a'] });
    expect(calls('presence.unwatch')).toEqual([{ userIds: ['a', 'b'] }]);
    expect(onOnline).not.toHaveBeenCalled();
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });
});
