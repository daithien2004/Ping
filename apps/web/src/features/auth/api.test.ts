import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const user = {
  id: 'u1',
  email: 'a@ping.dev',
  username: 'a',
  displayName: 'A',
  avatarUrl: null,
  createdAt: '2026-10-20T00:00:00.000Z',
};

/** Nạp lại cả api-client (token là state cấp module) cho mỗi test. */
async function load() {
  vi.resetModules();
  const client = await import('@/lib/api-client');
  const auth = await import('./api');
  return { ...client, ...auth };
}

let fetchMock: ReturnType<typeof vi.fn<Handler>>;

beforeEach(() => {
  fetchMock = vi.fn<Handler>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSession', () => {
  it('chưa có token, refresh thất bại → null (chưa đăng nhập), không gọi /users/me', async () => {
    const { getSession } = await load();
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' }));

    await expect(getSession()).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url.split('/api/v1')[1])).toEqual(['/auth/refresh']);
  });

  it('chưa có token (vừa F5), refresh thành công → lấy /users/me', async () => {
    const { getSession, getAccessToken } = await load();
    fetchMock.mockImplementation((url) =>
      url.endsWith('/auth/refresh') ? json(200, { accessToken: 't' }) : json(200, user),
    );

    await expect(getSession()).resolves.toEqual(user);
    expect(getAccessToken()).toBe('t');
  });

  it('đã có token → gọi thẳng /users/me', async () => {
    const { getSession, setAccessToken } = await load();
    setAccessToken('t');
    fetchMock.mockResolvedValue(json(200, user));

    await expect(getSession()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('login / logout', () => {
  it('login lưu access token và trả user', async () => {
    const { login, getAccessToken } = await load();
    fetchMock.mockResolvedValue(json(200, { user, accessToken: 'new' }));

    await expect(login({ email: 'a@ping.dev', password: 'password123' })).resolves.toEqual(user);
    expect(getAccessToken()).toBe('new');
  });

  it('logout xóa token kể cả khi API lỗi (vẫn phải đăng xuất phía client)', async () => {
    const { logout, setAccessToken, getAccessToken } = await load();
    setAccessToken('t');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await logout();
    expect(getAccessToken()).toBeNull();
  });
});
