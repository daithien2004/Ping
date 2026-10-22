import { describe, expect, it } from 'vitest';
import { loginRedirectPath, markSignedOut, safeRedirectPath } from './session';

describe('safeRedirectPath', () => {
  it('giữ đường dẫn nội bộ', () => {
    expect(safeRedirectPath('/servers/abc/channels/def')).toBe('/servers/abc/channels/def');
    expect(safeRedirectPath('/?tab=1')).toBe('/?tab=1');
  });

  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['servers'],
    [''],
    [null],
  ])('từ chối %j (open redirect) → "/servers"', (next) => {
    expect(safeRedirectPath(next)).toBe('/servers');
  });
});

describe('loginRedirectPath', () => {
  it('phiên hết hạn: giữ trang đang đứng trong ?next= để đăng nhập lại xong quay về', () => {
    expect(loginRedirectPath('/servers/s1/channels/c1')).toBe(
      '/login?next=%2Fservers%2Fs1%2Fchannels%2Fc1',
    );
  });

  it('tự đăng xuất: về /login không kèm next (người sau không bị dẫn tới trang của người trước), chỉ một lần', () => {
    markSignedOut();
    expect(loginRedirectPath('/servers/s1/channels/c1')).toBe('/login');
    expect(loginRedirectPath('/servers/s1')).toBe('/login?next=%2Fservers%2Fs1');
  });
});
