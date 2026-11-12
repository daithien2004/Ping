import { describe, expect, it } from 'vitest';
import { channelPath, homePath, messagePath, serverPath } from './navigation';

describe('navigation', () => {
  it('channelPath / serverPath theo URL kiểu Discord (ADR-0088)', () => {
    expect(serverPath('s1')).toBe('/channels/s1');
    expect(channelPath('s1', 'c1')).toBe('/channels/s1/c1');
  });

  it('messagePath: permalink server-scoped của một tin (TG.5)', () => {
    expect(messagePath('s1', 'c1', 'm1')).toBe('/channels/s1/c1/m1');
  });

  it('homePath: vào server đầu tiên nếu có, không thì null (màn hình trống)', () => {
    expect(homePath([{ id: 's1' }, { id: 's2' }])).toBe('/channels/s1');
    expect(homePath([])).toBeNull();
  });
});
