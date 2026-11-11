import { describe, expect, it } from 'vitest';
import type { ChannelScope } from '../../channel-scope';
import { unreadCursorOf } from './unread-cursor';

const messagePath = (id: string) => `/x/${id}`;
const server: ChannelScope = { kind: 'server', serverId: 's1', messagePath };
const rows = [
  { channelId: 'c1', lastReadMessageId: 'm5' },
  { channelId: 'c2', lastReadMessageId: null },
];

describe('unreadCursorOf', () => {
  it('kênh server: dữ liệu unread chưa về thì chưa biết', () => {
    expect(unreadCursorOf(server, undefined, 'c1')).toBeUndefined();
  });
  it('kênh server: lấy mốc của đúng kênh', () => {
    expect(unreadCursorOf(server, rows, 'c1')).toBe('m5');
  });
  it('kênh server: chưa đọc lần nào hoặc không có dòng cho kênh thì là null', () => {
    expect(unreadCursorOf(server, rows, 'c2')).toBeNull();
    expect(unreadCursorOf(server, rows, 'c9')).toBeNull();
  });
  it('DM: dùng mốc mang sẵn trong scope, không cần dữ liệu unread', () => {
    const dm: ChannelScope = { kind: 'dm', lastReadMessageId: 'm7', messagePath };
    expect(unreadCursorOf(dm, undefined, 'c1')).toBe('m7');
    expect(unreadCursorOf({ ...dm, lastReadMessageId: null }, rows, 'c1')).toBeNull();
  });
});
