import { describe, expect, it } from 'vitest';
import { channelRoom, presenceRoom, serverRoom, userRoom } from './rooms';

describe('room contract (ADR-0098)', () => {
  it('giữ nguyên tên room mà client cũ và hai service dựa vào', () => {
    expect(userRoom('u1')).toBe('user:u1');
    expect(serverRoom('s1')).toBe('server:s1');
    expect(channelRoom('c1')).toBe('channel:c1');
    expect(presenceRoom('u1')).toBe('presence:u1');
  });
});
