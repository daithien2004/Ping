import { describe, expect, it } from 'vitest';
import {
  ME_SEGMENT,
  channelIdFromPath,
  channelUrl,
  isDmPath,
  messageUrl,
  ownerUrl,
  serverIdFromPath,
} from './channel-url';

describe('channel-url', () => {
  it('dựng URL: DM dùng @me ở ô chủ sở hữu, tin là thêm một đoạn (ADR-0088)', () => {
    expect(ownerUrl(ME_SEGMENT)).toBe('/channels/@me');
    expect(ownerUrl('s1')).toBe('/channels/s1');
    expect(channelUrl('s1', 'c1')).toBe('/channels/s1/c1');
    expect(channelUrl(ME_SEGMENT, 'c1')).toBe('/channels/@me/c1');
    expect(messageUrl(ME_SEGMENT, 'c1', 'm1')).toBe('/channels/@me/c1/m1');
  });

  it('serverIdFromPath: @me không phải server; route cài đặt nội bộ vẫn ra serverId', () => {
    expect(serverIdFromPath('/channels/s1/c1/m1')).toBe('s1');
    expect(serverIdFromPath('/channels/@me/c1')).toBeNull();
    expect(serverIdFromPath('/servers/s1/settings')).toBe('s1');
    expect(serverIdFromPath('/settings/appearance')).toBeNull();
  });

  it('channelIdFromPath: chỉ URL kênh mới có channelId', () => {
    expect(channelIdFromPath('/channels/s1/c1/m1')).toBe('c1');
    expect(channelIdFromPath('/channels/@me/c1')).toBe('c1');
    expect(channelIdFromPath('/channels/@me')).toBeNull();
    expect(channelIdFromPath('/servers/s1/settings')).toBeNull();
  });

  it('isDmPath', () => {
    expect(isDmPath('/channels/@me')).toBe(true);
    expect(isDmPath('/channels/@me/c1')).toBe(true);
    expect(isDmPath('/channels/s1/c1')).toBe(false);
    expect(isDmPath('/dms/c1')).toBe(false);
  });
});
