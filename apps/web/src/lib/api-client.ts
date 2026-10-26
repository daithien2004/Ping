import {
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  ErrorCodes,
  errorCodeForStatus,
  isErrorCode,
  type ErrorCode,
} from '@ping/shared';
import type { ZodType } from 'zod';
import { apiBaseUrl } from './env';

/** Lỗi từ API, luôn mang `code` thuộc ErrorCodes và `requestId` (nếu server trả về) để báo lỗi. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Access token chỉ sống trong bộ nhớ của tab (không localStorage: chống XSS đọc trộm).
// Mất khi tải lại trang → khôi phục bằng refreshAccessToken() nhờ cookie httpOnly.
let accessToken: string | null = null;
// Promise refresh đang chạy: mọi request gặp 401 cùng lúc chờ chung một lần refresh.
let refreshing: Promise<string | null> | null = null;
let tokenGeneration = 0;
let unauthenticatedHandler: (() => void) | undefined;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  tokenGeneration++;
  refreshing = null;
  accessToken = token;
}

export function expireSession(): void {
  setAccessToken(null);
  unauthenticatedHandler?.();
}

/** Gọi khi phiên đăng nhập hết hẳn (refresh thất bại) — F2 nối vào điều hướng tới /login. */
export function setUnauthenticatedHandler(handler?: () => void): void {
  unauthenticatedHandler = handler;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Chờ giữa hai lần thử khi lỗi mạng (ms). */
const NETWORK_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Header thêm cho một request cụ thể (ví dụ `Accept: text/event-stream`). */
export interface SendOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function send(
  method: Method,
  path: string,
  body?: unknown,
  options?: SendOptions,
): Promise<Response> {
  const headers = new Headers();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  // Endpoint dùng cookie (refresh, logout) đòi header này để chống CSRF (ADR-0027).
  if (path === '/auth/refresh' || path === '/auth/logout') {
    headers.set(CLIENT_HEADER, CLIENT_HEADER_VALUE);
  }
  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    headers.set(name, value);
  }
  const request = () =>
    fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      // Gửi kèm cookie refresh (httpOnly) cho /auth/*; API bật CORS credentials cho WEB_ORIGIN.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options?.signal,
    });
  try {
    return await request();
  } catch (error) {
    // Người dùng hủy (đóng dialog, rời trang): để AbortError đi tiếp, không thử lại.
    if (options?.signal?.aborted) throw error;
    // fetch chỉ reject khi không tới được server (mất mạng, API tắt, CORS chặn).
    // Thử lại một lần cho GET: sau khi API khởi động lại, trình duyệt vẫn còn socket keep-alive
    // cũ (Chrome giữ tới ~4 phút) nên request có thể rơi vào socket đã chết. Lần thử sau mở
    // kết nối khác nên thường thành công. GET là idempotent nên thử lại không đổi trạng thái;
    // POST (đăng nhập, refresh) không thử lại vì API xoay vòng refresh token (ADR-0007).
    if (method === 'GET') {
      await delay(NETWORK_RETRY_DELAY_MS);
      try {
        return await request();
      } catch {
        // Vẫn không tới được server: báo lỗi mạng như bên dưới.
      }
    }
    throw new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'Network error');
  }
}

/**
 * Đổi refresh cookie lấy access token mới. Gọi đồng thời bao nhiêu lần cũng chỉ một request
 * /auth/refresh — quan trọng vì API xoay vòng refresh token (ADR-0007).
 * Trả null nếu phiên đã hết (chưa đăng nhập, cookie hết hạn hoặc bị thu hồi).
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  const generation = tokenGeneration;
  const pending = send('POST', '/auth/refresh')
    .then(async (res) => {
      if (res.status === 401) return null;
      if (!res.ok) throw await toApiError(res);
      return ((await res.json()) as { accessToken: string }).accessToken;
    })
    .then((token) => {
      if (generation !== tokenGeneration) return null;
      accessToken = token;
      return token;
    })
    .finally(() => {
      if (refreshing === pending) refreshing = null;
    });
  refreshing = pending;
  return pending;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Không phải JSON (ví dụ proxy trả trang lỗi HTML): dùng status.
  }
  const requestId =
    typeof body.requestId === 'string'
      ? body.requestId
      : (res.headers.get('X-Request-Id') ?? undefined);
  return new ApiError(
    res.status,
    isErrorCode(body.code) ? body.code : errorCodeForStatus(res.status),
    typeof body.message === 'string' ? body.message : res.statusText || 'Request failed',
    requestId,
    body.details,
  );
}

/**
 * Gửi request, tự refresh access token một lần khi gặp 401 (trừ `/auth/*` để không lặp vô hạn).
 * Dùng chung cho `request` (JSON) và `stream` (SSE).
 */
async function sendWithRefresh(
  method: Method,
  path: string,
  body?: unknown,
  options?: SendOptions,
): Promise<Response> {
  const generation = tokenGeneration;
  let res = await send(method, path, body, options);

  // Access token hết hạn (15 phút): refresh một lần rồi thử lại đúng một lần.
  // Bỏ qua /auth/*: login sai mật khẩu cũng là 401, refresh ở đó sẽ thành vòng lặp.
  if (res.status === 401 && !path.startsWith('/auth/') && generation === tokenGeneration) {
    if ((await refreshAccessToken()) && generation === tokenGeneration) {
      res = await send(method, path, body, options);
    }
    if (res.status === 401 && generation === tokenGeneration) {
      expireSession();
    }
  }
  return res;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  const res = await sendWithRefresh(method, path, body);
  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data: unknown = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

/**
 * Như `request` nhưng trả nguyên `Response` để đọc dần — dùng cho SSE (`text/event-stream`).
 * Không gọi `res.json()` vì body là luồng sự kiện; vẫn gắn Bearer token, cookie và refresh 401.
 */
async function stream(
  method: Method,
  path: string,
  body?: unknown,
  options?: SendOptions,
): Promise<Response> {
  const res = await sendWithRefresh(method, path, body, options);
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res;
}

/** `schema` (tùy chọn): parse response bằng zod ở những chỗ quan trọng (hướng dẫn 12.2). */
export const api = {
  /** Binary PUT with real upload progress; shares token refresh and API error handling. */
  upload: async (
    path: string,
    file: File,
    signal: AbortSignal,
    progress: (percent: number) => void,
  ): Promise<void> => {
    const run = () =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', `${apiBaseUrl}${path}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
        };
        const abort = () => xhr.abort();
        const cleanup = () => signal.removeEventListener('abort', abort);
        xhr.onload = () => {
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else void toApiError(new Response(xhr.responseText, { status: xhr.status })).then(reject);
        };
        xhr.onerror = () => {
          cleanup();
          reject(new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'Network error'));
        };
        xhr.onabort = () => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        } else xhr.send(file);
      });
    try {
      await run();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && (await refreshAccessToken()))
        await run();
      else throw error;
    }
  },
  get: <T>(path: string, schema?: ZodType<T>) => request<T>('GET', path, undefined, schema),
  post: <T>(path: string, body?: unknown, schema?: ZodType<T>) =>
    request<T>('POST', path, body, schema),
  patch: <T>(path: string, body?: unknown, schema?: ZodType<T>) =>
    request<T>('PATCH', path, body, schema),
  put: <T>(path: string, body?: unknown, schema?: ZodType<T>) =>
    request<T>('PUT', path, body, schema),
  delete: <T = void>(path: string, schema?: ZodType<T>) =>
    request<T>('DELETE', path, undefined, schema),
  /**
   * Request trả về `Response` chưa đọc — dùng cho SSE. Ví dụ:
   * `api.stream('POST', '/servers/x/ask', body, { signal, headers: { Accept: 'text/event-stream' } })`.
   */
  stream: (method: Method, path: string, body?: unknown, options?: SendOptions) =>
    stream(method, path, body, options),
};
