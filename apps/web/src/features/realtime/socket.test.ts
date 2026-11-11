import { ServerEvents } from '@ping/shared';
import { describe, expect, it, vi } from 'vitest';
import { onServerEvent, type RealtimeSocket } from './socket';

describe('onServerEvent', () => {
  it('gắn đúng handler vào đúng sự kiện và trả về hàm gỡ cùng handler đó', () => {
    const on = vi.fn();
    const off = vi.fn();
    const socket = { on, off } as unknown as RealtimeSocket;
    const handler = vi.fn();

    const stop = onServerEvent(socket, ServerEvents.MessageCreated, handler);
    expect(on).toHaveBeenCalledWith(ServerEvents.MessageCreated, handler);
    expect(off).not.toHaveBeenCalled();

    stop();
    expect(off).toHaveBeenCalledWith(ServerEvents.MessageCreated, handler);
  });
});
