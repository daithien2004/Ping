import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeSocket } from './socket';
import { RealtimeSession } from './session';

function fixture() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    connected: false,
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) =>
      listeners.get(event)?.delete(fn),
    ),
    connect: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    volatile: { emit: vi.fn() },
  };
  const refresh = vi.fn<() => Promise<string | null>>().mockResolvedValue('new');
  const expired = vi.fn();
  const session = new RealtimeSession(socket as unknown as RealtimeSocket, refresh, expired);
  const fire = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args);
  };
  return { socket, refresh, expired, session, fire };
}

afterEach(() => vi.useRealTimers());
describe('realtime session', () => {
  it('denied room hides stale UI, permission restoration joins again, typing is throttled', () => {
    vi.useFakeTimers();
    const { session, socket, fire } = fixture();
    session.start();
    session.watch('s', 'c', vi.fn(), vi.fn());
    socket.connected = true;
    fire('connect');
    const denied = socket.emit.mock.calls[0]?.[2] as (
      error: null,
      result: { ok: false; code: string },
    ) => void;
    denied(null, { ok: false, code: 'FORBIDDEN' });
    expect(session.store.getState().roomErrors.c).toBe(true);
    session.type('c');
    expect(socket.volatile.emit).not.toHaveBeenCalled();
    session.rejoin('s');
    const granted = socket.emit.mock.calls[1]?.[2] as (error: null, result: { ok: true }) => void;
    granted(null, { ok: true });
    expect(session.store.getState().roomErrors.c).toBe(false);
    session.type('c');
    session.type('c');
    expect(socket.volatile.emit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(3000);
    session.type('c');
    expect(socket.volatile.emit).toHaveBeenCalledTimes(2);
    session.stop();
  });

  it('does not loop refresh if a newly refreshed token is rejected', async () => {
    const { session, fire, expired, refresh } = fixture();
    session.start();
    fire('connect_error');
    await Promise.resolve();
    fire('connect_error');
    expect(refresh).toHaveBeenCalledOnce();
    expect(expired).toHaveBeenCalledOnce();
    session.stop();
  });
  it('joins on connect, rejoins on reconnect, ignores late ACK after room cleanup', () => {
    const { session, socket, fire } = fixture();
    const synced = vi.fn();
    session.start();
    const leave = session.watch('s', 'c', synced, vi.fn());
    socket.connected = true;
    fire('connect');
    const ack = socket.emit.mock.calls[0]?.[2] as (
      error: Error | null,
      result: { ok: true },
    ) => void;
    ack(null, { ok: true });
    expect(synced).toHaveBeenCalledOnce();
    fire('connect');
    expect(socket.emit.mock.calls.filter(([event]) => event === 'channel.join')).toHaveLength(2);
    leave();
    ack(null, { ok: true });
    expect(synced).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledWith('channel.leave', { channelId: 'c' });
    session.stop();
  });

  it('refreshes forced disconnect once and does not reconnect after logout cleanup', async () => {
    const { session, socket, fire, refresh } = fixture();
    let complete!: (token: string) => void;
    refresh.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    session.start();
    fire('disconnect', 'io server disconnect');
    fire('disconnect', 'io server disconnect');
    expect(refresh).toHaveBeenCalledOnce();
    session.stop();
    complete('new');
    await Promise.resolve();
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('retries transient refresh errors without expiring the session', async () => {
    vi.useFakeTimers();
    const { session, refresh, expired, fire } = fixture();
    refresh.mockRejectedValueOnce(new Error('offline'));
    session.start();
    fire('disconnect', 'io server disconnect');
    await vi.advanceTimersByTimeAsync(2100);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(expired).not.toHaveBeenCalled();
    session.stop();
  });

  it('expires rejected refresh and clears typing when disconnected', async () => {
    const { session, refresh, expired, fire } = fixture();
    refresh.mockResolvedValue(null);
    session.start();
    session.store.getState().type('c', 'u');
    fire('disconnect', 'io server disconnect');
    await Promise.resolve();
    expect(expired).toHaveBeenCalledOnce();
    expect(session.store.getState().typing).toEqual({});
    session.stop();
  });
});
