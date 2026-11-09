import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingToast } from './ping-toast';

describe('pingToast khi chưa có host', () => {
  afterEach(() => vi.restoreAllMocks());

  it('không ném lỗi và cảnh báo ở dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => pingToast.error('lỗi')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('PingToastHost');
  });
});
