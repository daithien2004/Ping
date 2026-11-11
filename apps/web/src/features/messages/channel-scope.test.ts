import { describe, expect, it } from 'vitest';
import { isDmScope, serverIdOf, type ChannelScope } from './channel-scope';

const messagePath = (id: string) => `/x/${id}`;

describe('serverIdOf', () => {
  it('kênh của server: trả serverId', () => {
    const scope: ChannelScope = { kind: 'server', serverId: 's1', messagePath };
    expect(serverIdOf(scope)).toBe('s1');
  });
  it('DM: không thuộc server nào nên trả null', () => {
    const scope: ChannelScope = { kind: 'dm', lastReadMessageId: null, messagePath };
    expect(serverIdOf(scope)).toBeNull();
  });
});

describe('isDmScope', () => {
  it('chỉ DM mới là DM', () => {
    expect(isDmScope({ kind: 'dm', lastReadMessageId: null, messagePath })).toBe(true);
    expect(isDmScope({ kind: 'server', serverId: 's1', messagePath })).toBe(false);
  });
});
