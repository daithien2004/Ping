import { ErrorCodes } from '@ping/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const API = 'http://localhost:4000/api/v1';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Nạp lại module mỗi test: token và Promise refresh là state cấp module. */
async function load() {
  vi.resetModules();
  return import('./api-client');
}

let fetchMock: ReturnType<typeof vi.fn<Handler>>;

beforeEach(() => {
  fetchMock = vi.fn<Handler>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const authHeader = (init: RequestInit) => new Headers(init.headers).get('Authorization');

describe('api-client', () => {
  it('a stale 401 from a previous session cannot sign out the newly logged-in user', async () => {
    const { api, setAccessToken, getAccessToken, setUnauthenticatedHandler } = await load();
    const expired = vi.fn();
    setUnauthenticatedHandler(expired);
    setAccessToken('old');
    let complete!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    const request = api.get('/users/me');
    setAccessToken('new-session');
    complete(json(401, { code: 'UNAUTHORIZED' }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe('new-session');
    expect(expired).not.toHaveBeenCalled();
  });
  it('temporary refresh network failure keeps token and session', async () => {
    const { refreshAccessToken, setAccessToken, getAccessToken, setUnauthenticatedHandler } =
      await load();
    const expired = vi.fn();
    setUnauthenticatedHandler(expired);
    setAccessToken('old');
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 0 });
    expect(getAccessToken()).toBe('old');
    expect(expired).not.toHaveBeenCalled();
  });

  it('logout invalidates an in-flight refresh so it cannot restore the old token', async () => {
    const { refreshAccessToken, setAccessToken, getAccessToken } = await load();
    let complete!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    setAccessToken('old');
    const pending = refreshAccessToken();
    setAccessToken(null);
    complete(json(200, { accessToken: 'stale' }));
    await pending;
    expect(getAccessToken()).toBeNull();
  });
  it('gắn Bearer token và gửi kèm cookie (credentials: include)', async () => {
    const { api, setAccessToken } = await load();
    setAccessToken('tok-1');
    fetchMock.mockResolvedValue(json(200, { ok: true }));

    await expect(api.get('/users/me')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/users/me`);
    expect(authHeader(init)).toBe('Bearer tok-1');
    expect(init.credentials).toBe('include');
  });

  it('gửi body dạng JSON và parse response bằng schema nếu có', async () => {
    const { api } = await load();
    fetchMock.mockResolvedValue(json(201, { id: 'a', extra: 1 }));

    const result = await api.post('/servers', { name: 'x' }, z.object({ id: z.string() }));

    expect(result).toEqual({ id: 'a' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'x' }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('401 → refresh rồi thử lại request với token mới', async () => {
    const { api, setAccessToken, getAccessToken } = await load();
    setAccessToken('old');
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new' });
      return authHeader(init) === 'Bearer new'
        ? json(200, { me: true })
        : json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' });
    });

    await expect(api.get('/users/me')).resolves.toEqual({ me: true });
    expect(getAccessToken()).toBe('new');
  });

  it('nhiều request cùng gặp 401 chỉ gọi /auth/refresh đúng một lần', async () => {
    const { api, setAccessToken } = await load();
    setAccessToken('old');
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json(200, { accessToken: 'new' });
      }
      return authHeader(init) === 'Bearer new'
        ? json(200, { url })
        : json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' });
    });

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('refresh thất bại → xóa token, gọi onUnauthenticated, ném ApiError UNAUTHORIZED', async () => {
    const { api, ApiError, setAccessToken, getAccessToken, setUnauthenticatedHandler } =
      await load();
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);
    setAccessToken('old');
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' }));

    const error = await api.get('/users/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: ErrorCodes.UNAUTHORIZED });
    expect(getAccessToken()).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('401 từ chính /auth/* không kích hoạt refresh (tránh vòng lặp)', async () => {
    const { api } = await load();
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' }));

    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('lỗi API thành ApiError có code + requestId; thiếu requestId trong body thì lấy header', async () => {
    const { api } = await load();
    fetchMock.mockResolvedValueOnce(
      json(403, { code: 'FORBIDDEN', message: 'Nope', requestId: 'req-body' }),
    );
    await expect(api.get('/servers/x')).rejects.toMatchObject({
      status: 403,
      code: ErrorCodes.FORBIDDEN,
      message: 'Nope',
      requestId: 'req-body',
    });

    fetchMock.mockResolvedValueOnce(
      new Response('oops', { status: 502, headers: { 'X-Request-Id': 'req-hdr' } }),
    );
    await expect(api.get('/servers/x')).rejects.toMatchObject({
      status: 502,
      code: ErrorCodes.INTERNAL_ERROR,
      requestId: 'req-hdr',
    });
  });

  it('204 trả undefined', async () => {
    const { api } = await load();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete('/servers/x/members/y')).resolves.toBeUndefined();
  });

  it('lỗi mạng (fetch reject) thành ApiError status 0', async () => {
    const { api } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/health')).rejects.toMatchObject({ status: 0 });
  });
});
