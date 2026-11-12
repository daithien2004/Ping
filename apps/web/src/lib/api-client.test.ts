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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Đợi các promise nối tiếp (acquireSlot → fetch) chạy xong trong một lượt microtask. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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
  it('refresh nhận 401 do xoay vòng đồng thời → thử lại một lần bằng cookie mới (ADR-0007)', async () => {
    const { refreshAccessToken, getAccessToken } = await load();
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', message: 'already rotated' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh' }));

    await expect(refreshAccessToken()).resolves.toBe('fresh');
    expect(getAccessToken()).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh 401 vì không có cookie thì không thử lần hai (không đốt bucket authSession)', async () => {
    const { refreshAccessToken, getAccessToken } = await load();
    fetchMock.mockResolvedValue(
      json(401, { code: 'UNAUTHORIZED', message: 'Missing refresh token' }),
    );

    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refresh nhận 401 hai lần → coi như hết phiên, không thử lần ba', async () => {
    const { refreshAccessToken, getAccessToken } = await load();
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'invalid' }));

    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('sau F5 các query mount sớm chờ khôi phục phiên rồi mới gửi, không bắn 401 hàng loạt', async () => {
    const { api, restoreSession, getAccessToken } = await load();
    let completeRefresh!: (value: Response) => void;
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          completeRefresh = resolve;
        });
      }
      return Promise.resolve(json(200, { auth: authHeader(init) }));
    });

    const restore = restoreSession();
    // Ba query cùng mount lúc chưa có token (cache khung được hydrate từ localStorage).
    const requests = [api.get('/servers'), api.get('/dms'), api.get('/users/me/unread')];
    await flushMicrotasks();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${API}/auth/refresh`]);

    completeRefresh(json(200, { accessToken: 'fresh' }));
    await expect(restore).resolves.toBe('fresh');
    await expect(Promise.all(requests)).resolves.toEqual([
      { auth: 'Bearer fresh' },
      { auth: 'Bearer fresh' },
      { auth: 'Bearer fresh' },
    ]);
    expect(getAccessToken()).toBe('fresh');
  });

  it('restoreSession: dùng token đang có, gộp các lời gọi đồng thời thành một lần refresh', async () => {
    const { restoreSession, setAccessToken } = await load();
    setAccessToken('tok');
    await expect(restoreSession()).resolves.toBe('tok');
    expect(fetchMock).not.toHaveBeenCalled();

    setAccessToken(null);
    fetchMock.mockResolvedValue(json(200, { accessToken: 'new' }));
    const [a, b] = await Promise.all([restoreSession(), restoreSession()]);
    expect([a, b]).toEqual(['new', 'new']);
    expect(fetchMock).toHaveBeenCalledOnce();
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

  it('gửi X-Ping-Client chỉ cho refresh và logout (chống CSRF, ADR-0027)', async () => {
    const { api, refreshAccessToken } = await load();
    fetchMock.mockImplementation(() => json(200, { accessToken: 't' }));
    await refreshAccessToken();
    await api.post('/auth/logout');
    await api.get('/users/me');
    const headerOf = (call: number) =>
      new Headers(fetchMock.mock.calls[call]![1].headers).get('X-Ping-Client');
    expect(headerOf(0)).toBe('web');
    expect(headerOf(1)).toBe('web');
    expect(headerOf(2)).toBeNull();
  });

  it('refresh/logout dùng keepalive: Set-Cookie không mất khi trang đang điều hướng', async () => {
    const { api, refreshAccessToken } = await load();
    fetchMock.mockImplementation(() => json(200, { accessToken: 't' }));
    await refreshAccessToken();
    await api.post('/auth/logout');
    await api.get('/users/me');

    const keepaliveOf = (call: number) => fetchMock.mock.calls[call]![1].keepalive;
    expect(keepaliveOf(0)).toBe(true);
    expect(keepaliveOf(1)).toBe(true);
    expect(keepaliveOf(2)).toBe(false);
  });

  it('401 về muộn sau khi request khác refresh xong → gửi lại bằng token mới, không xoay vòng thêm', async () => {
    const { api, refreshAccessToken, setAccessToken } = await load();
    setAccessToken('old');
    let releaseFirst!: (value: Response) => void;
    let firstRequest = true;
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new' });
      if (authHeader(init) === 'Bearer old' && firstRequest) {
        firstRequest = false;
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return json(200, { ok: true });
    });

    const pending = api.get('/users/me');
    await flushMicrotasks();
    // Request khác đã refresh xong trong lúc request này còn bay.
    await refreshAccessToken();
    releaseFirst(json(401, { code: 'UNAUTHORIZED', message: 'x' }));
    await expect(pending).resolves.toEqual({ ok: true });

    const calls = (suffix: string) =>
      fetchMock.mock.calls.filter(([url]) => url === `${API}${suffix}`);
    expect(calls('/auth/refresh')).toHaveLength(1);
    const retried = calls('/users/me');
    expect(retried).toHaveLength(2);
    expect(authHeader(retried[1]![1])).toBe('Bearer new');
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

  it('200/202 với body rỗng trả undefined, không ném SyntaxError (TG.8: quên mật khẩu luôn 202)', async () => {
    const { api } = await load();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(api.post('/auth/password/forgot', { email: 'a@b.c' })).resolves.toBeUndefined();
    await expect(api.post('/auth/verify-email', { token: 'x' })).resolves.toBeUndefined();
  });

  it('lỗi mạng (fetch reject) thành ApiError status 0', async () => {
    const { api } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/health')).rejects.toMatchObject({ status: 0 });
  });

  it('GET lỗi mạng thì thử lại một lần (socket keep-alive cũ sau khi API restart)', async () => {
    const { api } = await load();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(api.get('/users/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET lỗi mạng hai lần thì báo lỗi mạng, không thử lần ba', async () => {
    const { api } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.get('/users/me')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('POST không thử lại khi lỗi mạng (refresh token xoay vòng, login không lặp lại)', async () => {
    const { api } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toMatchObject({
      status: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET gặp 429 tự chờ Retry-After rồi thử lại một lần; hàng đợi cũng chờ theo (ADR-0078)', async () => {
    vi.useFakeTimers();
    const { api } = await load();
    fetchMock.mockImplementation((url) =>
      url.endsWith('/a') && fetchMock.mock.calls.length === 1
        ? json(429, { code: 'TOO_MANY_REQUESTS' }, { 'Retry-After': '2' })
        : json(200, { ok: true }),
    );

    const a = api.get('/a');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const b = api.get('/b');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(a).resolves.toEqual({ ok: true });
    await expect(b).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('thử lại sau 429 dựng lại header, dùng token mới nhất', async () => {
    vi.useFakeTimers();
    const { api, setAccessToken } = await load();
    setAccessToken('old');
    fetchMock.mockImplementation(() =>
      fetchMock.mock.calls.length === 1
        ? json(429, { code: 'TOO_MANY_REQUESTS' }, { 'Retry-After': '1' })
        : json(200, { ok: true }),
    );

    const request = api.get('/servers');
    await flushMicrotasks();
    // Token đổi trong lúc request đang chờ Retry-After (ví dụ refresh của tab khác vừa xong).
    setAccessToken('new');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toEqual({ ok: true });
    expect(authHeader(fetchMock.mock.calls[1]![1])).toBe('Bearer new');
  });

  it('GET gặp 429 hai lần liên tiếp thì báo lỗi, không thử lần ba', async () => {
    vi.useFakeTimers();
    const { api } = await load();
    fetchMock.mockResolvedValue(json(429, { code: 'TOO_MANY_REQUESTS' }, { 'Retry-After': '1' }));

    const request = api.get('/a').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await request;

    expect(error).toMatchObject({ status: 429, code: ErrorCodes.TOO_MANY_REQUESTS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('POST gặp 429 không tự thử lại (không chắc idempotent)', async () => {
    vi.useFakeTimers();
    const { api } = await load();
    fetchMock.mockResolvedValue(json(429, { code: 'TOO_MANY_REQUESTS' }, { 'Retry-After': '1' }));

    await expect(api.post('/messages', { content: 'x' })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('X-RateLimit-Remaining: 0 tạm dừng tới X-RateLimit-Reset (không bắn vào bucket cạn)', async () => {
    vi.useFakeTimers();
    const { api } = await load();
    fetchMock.mockImplementationOnce(() =>
      json(200, { ok: 1 }, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '3' }),
    );

    await api.get('/a');
    const next = api.get('/b');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(json(200, { ok: 2 }));
    await vi.advanceTimersByTimeAsync(1);
    await expect(next).resolves.toEqual({ ok: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('giới hạn số request đang bay (hàng đợi FIFO)', async () => {
    const { api } = await load();
    const pending: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));

    const requests = Array.from({ length: 8 }, (_, index) => api.get(`/r${index}`));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(6);

    pending.shift()!(json(200, { ok: true }));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(7);

    while (pending.length > 0) {
      pending.shift()!(json(200, { ok: true }));
      await flushMicrotasks();
    }
    await expect(Promise.all(requests)).resolves.toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('hủy khi còn trong hàng đợi → AbortError, không gửi request', async () => {
    const { api } = await load();
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const blockers = Array.from({ length: 6 }, (_, index) => api.get(`/b${index}`));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const controller = new AbortController();
    const queued = api.stream('GET', '/later', undefined, { signal: controller.signal });
    await flushMicrotasks();
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    void blockers;
  });

  it('stream trả nguyên Response để đọc dần, kèm Bearer và header thêm', async () => {
    const { api, setAccessToken } = await load();
    setAccessToken('tok-s');
    fetchMock.mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const res = await api.stream(
      'POST',
      '/servers/s1/ask',
      { question: 'q' },
      { headers: { Accept: 'text/event-stream' } },
    );

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/servers/s1/ask`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ question: 'q' }));
    expect(authHeader(init)).toBe('Bearer tok-s');
    expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('stream 401 → refresh rồi thử lại một lần với token mới', async () => {
    const { api, setAccessToken, getAccessToken } = await load();
    setAccessToken('old');
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new' });
      return authHeader(init) === 'Bearer new'
        ? new Response(new ReadableStream(), { status: 200 })
        : json(401, { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' });
    });

    const res = await api.stream('POST', '/servers/s1/ask', { question: 'q' });

    expect(res.status).toBe(200);
    expect(getAccessToken()).toBe('new');
  });

  it('stream lỗi HTTP thành ApiError có code', async () => {
    const { api, ApiError } = await load();
    fetchMock.mockResolvedValue(json(403, { code: 'FORBIDDEN', message: 'Nope' }));

    const error = await api
      .stream('POST', '/servers/s1/ask', { question: 'q' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: ErrorCodes.FORBIDDEN });
  });
});
