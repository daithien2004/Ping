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

// Lần khôi phục phiên đang chạy (F5): dùng chung cho query mount sớm và socket.
let restoring: Promise<string | null> | null = null;

/**
 * Khôi phục access token từ cookie refresh, tối đa MỘT request cho cả lượt tải trang.
 *
 * Sau F5 token trong RAM đã mất, nhưng cache khung lưu trong localStorage khiến cây `(app)`
 * mount và bắn query trước khi `getSession` kịp đổi cookie. Không chờ nhau thì cả loạt query
 * gửi đi không kèm `Authorization`, nhận 401, rồi mỗi 401 lại xoay vòng refresh token — đốt
 * sạch bucket `authSession` (30/phút/IP, ADR-0080) chỉ bằng một lần F5.
 *
 * Ném lỗi khi refresh hỏng tạm thời (mạng, 429, 5xx) để caller tự quyết định thử lại.
 */
export function restoreSession(): Promise<string | null> {
  if (accessToken) return Promise.resolve(accessToken);
  restoring ??= refreshAccessToken().finally(() => {
    restoring = null;
  });
  return restoring;
}

/**
 * Chờ lần khôi phục phiên đang chạy (nếu có) trước khi gửi request cần token. Không tự bắt
 * đầu refresh: trang chưa đăng nhập không phải trả giá bằng một request /auth/refresh.
 */
async function waitForSession(): Promise<void> {
  if (accessToken || !restoring) return;
  try {
    await restoring;
  } catch {
    // Lỗi tạm thời: cứ gửi request; nếu 401 thì `sendWithRefresh` chờ Retry-After rồi xử lý.
  }
}

/** Gọi khi phiên đăng nhập hết hẳn (refresh thất bại) — F2 nối vào điều hướng tới /login. */
export function setUnauthenticatedHandler(handler?: () => void): void {
  unauthenticatedHandler = handler;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Chờ giữa hai lần thử khi lỗi mạng (ms). */
const NETWORK_RETRY_DELAY_MS = 300;

/**
 * Số request tối đa đang bay. Trình duyệt tự giới hạn ~6 kết nối/host; giữ đúng mức đó để
 * hàng đợi không dồn request vào socket mà vẫn che được các đợt bắn đồng loạt (rail nhiều
 * server, nhiều component cùng mount).
 */
const MAX_IN_FLIGHT = 6;
/** 429 không kèm header: chờ ngắn rồi thử tiếp thay vì bắn lại ngay. */
const RETRY_AFTER_FALLBACK_MS = 1_000;
/** Trần chờ: server khóa 60 giây (app.module) — không để một header lạ treo tab vô hạn. */
const RETRY_AFTER_MAX_MS = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Như `delay` nhưng dừng ngay khi signal bị hủy (đóng dialog/rời trang giữa lúc chờ 429). */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface QueueWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

let inFlight = 0;
const waiters: QueueWaiter[] = [];
let pausedUntil = 0;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;

const abortError = () => new DOMException('Aborted', 'AbortError');

/** Cấp một suất chạy: FIFO, tôn trọng trạng thái tạm dừng và signal của từng request. */
function acquireSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const waiter: QueueWaiter = { resolve, reject, signal };
    if (signal) {
      waiter.onAbort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(abortError());
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
    }
    waiters.push(waiter);
    pump();
  });
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  pump();
}

/**
 * Nhả hàng đợi khi còn suất. Trong lúc tạm dừng thì đứng yên: request mới (kể cả refresh)
 * chờ đúng `Retry-After`, không bắn vào cửa sổ đang bị khóa.
 */
function pump(): void {
  if (pausedUntil > Date.now()) return;
  while (inFlight < MAX_IN_FLIGHT && waiters.length > 0) {
    const waiter = waiters.shift()!;
    if (waiter.signal?.aborted) {
      waiter.reject(abortError());
      continue;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    inFlight += 1;
    waiter.resolve();
  }
}

/** Tạm dừng TOÀN BỘ hàng đợi tới `ms` nữa; lần tạm dừng dài hơn thắng. */
function pauseFor(ms: number): void {
  if (ms <= 0) return;
  const until = Date.now() + ms;
  if (until <= pausedUntil) return;
  pausedUntil = until;
  if (pauseTimer !== undefined) clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => {
    pauseTimer = undefined;
    pausedUntil = 0;
    pump();
  }, ms);
  // Node (test/SSR) giữ timer sống ngoài request — không cần chặn process thoát.
  (pauseTimer as { unref?: () => void }).unref?.();
}

/** Đổi "số giây" của header (Retry-After / Reset) sang ms; `null` khi không đọc được. */
function headerMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Điều tiết theo phản hồi (ADR-0078): 429 → chờ `Retry-After`; còn `X-RateLimit-Remaining: 0`
 * → chờ tới `X-RateLimit-Reset` để không bắn vào bucket đã cạn (Discord yêu cầu đúng điều
 * này ở phía client). Gọi cả sau lần thử lại lỗi mạng.
 */
function noteRateLimit(rate: {
  status: number;
  retryAfter: string | null;
  remaining: string | null;
  reset: string | null;
}): void {
  if (rate.status === 429) {
    pauseFor(Math.min(headerMs(rate.retryAfter) ?? RETRY_AFTER_FALLBACK_MS, RETRY_AFTER_MAX_MS));
    return;
  }
  if (rate.remaining === '0') {
    const reset = headerMs(rate.reset);
    if (reset !== null) pauseFor(Math.min(reset, RETRY_AFTER_MAX_MS));
  }
}

function noteResponse(response: Response): void {
  noteRateLimit({
    status: response.status,
    retryAfter: response.headers.get('Retry-After'),
    remaining: response.headers.get('X-RateLimit-Remaining'),
    reset: response.headers.get('X-RateLimit-Reset'),
  });
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
  // Header dựng ở MỖI lần gửi, không phải một lần lúc gọi: request chờ suất trong hàng đợi
  // (hoặc chờ khôi phục phiên) có thể được gửi sau khi token vừa đổi — dựng sớm sẽ mang
  // token cũ/không có và nhận 401 oan.
  const buildHeaders = (): Headers => {
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
    return headers;
  };
  // Refresh xoay vòng token và trả cookie mới. Nếu trang đang điều hướng (F5, mở URL khác) thì
  // request thường bị hủy giữa chừng: server đã xoay vòng nhưng Set-Cookie không kịp vào cookie
  // jar, tài liệu kế tiếp gửi token cũ và nhận 401 "already rotated". `keepalive` để trình duyệt
  // hoàn tất request và ghi cookie dù tài liệu cũ đã bị gỡ. Logout cũng cần để cookie bị xóa hẳn.
  const keepalive = path === '/auth/refresh' || path === '/auth/logout';
  const request = () =>
    fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: buildHeaders(),
      // Gửi kèm cookie refresh (httpOnly) cho /auth/*; API bật CORS credentials cho WEB_ORIGIN.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options?.signal,
      keepalive,
    });
  // Mỗi lần gọi thật chiếm một suất (ADR-0078); nhả ngay khi fetch trả về — kể cả SSE, để
  // một kết nối dài không giữ suất của cả app.
  const attempt = async (): Promise<Response> => {
    await acquireSlot(options?.signal);
    try {
      return await request();
    } finally {
      releaseSlot();
    }
  };

  try {
    let response = await attempt();
    noteResponse(response);
    // 429 của chính request GET: chờ đúng Retry-After rồi thử lại một lần (ADR-0078). Không thử
    // lần hai; POST/PUT/PATCH/DELETE không thử lại vì không chắc idempotent.
    if (method === 'GET' && response.status === 429) {
      const retryAfter = Math.min(
        headerMs(response.headers.get('Retry-After')) ?? RETRY_AFTER_FALLBACK_MS,
        RETRY_AFTER_MAX_MS,
      );
      await wait(retryAfter, options?.signal);
      response = await attempt();
      noteResponse(response);
    }
    return response;
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
        const response = await attempt();
        noteResponse(response);
        return response;
      } catch (retryError) {
        // Trong lúc chờ, người dùng đóng dialog/rời trang: giữ nguyên AbortError.
        if (options?.signal?.aborted) throw retryError;
        // Vẫn không tới được server: báo lỗi mạng như bên dưới.
      }
    }
    throw new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'Network error');
  }
}

/**
 * Chờ trước khi thử refresh lần hai: request refresh thua trong một lần xoay vòng đồng thời
 * (hai tab, hoặc tải lại trang giữa lúc khôi phục phiên) nhận 401 ngay sau khi bên thắng đã
 * ghi cookie mới — chờ một nhịp để Set-Cookie của bên thắng kịp vào cookie jar.
 */
const REFRESH_RETRY_DELAY_MS = 200;

/**
 * Gọi /auth/refresh, thử lại MỘT lần khi 401 do thua một lần xoay vòng đồng thời. ADR-0007: hai
 * request refresh đồng thời (hai tab, hoặc trang cũ bị điều hướng giữa lúc khôi phục phiên) thì
 * đúng một bên xoay vòng token thành công; bên thua gửi kèm cookie CŨ nên nhận 401 "already
 * rotated" dù cookie jar đã có token mới. Không thử lại thì tab thua bị đăng xuất oan — đúng thứ
 * ADR-0007 nói cửa sổ 10 giây phải tránh. Thiếu cookie hẳn thì không thử (xem `lostRotationRace`).
 */
async function requestRefresh(): Promise<Response> {
  const first = await send('POST', '/auth/refresh');
  if (!(await lostRotationRace(first))) return first;
  await delay(REFRESH_RETRY_DELAY_MS);
  return send('POST', '/auth/refresh');
}

/**
 * Có nên thử lại sau 401 của `/auth/refresh`? Chỉ khi lần đầu CÓ cookie nhưng thua một lần xoay
 * vòng đồng thời. 401 "Missing refresh token" nghĩa là request không mang cookie nào (khách chưa
 * đăng nhập, hoặc đã đăng xuất ở tab khác) — gửi lại chắc chắn 401 nữa, chỉ tốn thêm một suất
 * của bucket `authSession` (30/phút/IP, ADR-0080). Màn `/login` của khách vì thế tốn 1 request
 * thay vì 2 mỗi lần mở.
 */
async function lostRotationRace(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { message?: unknown };
    return body.message !== 'Missing refresh token';
  } catch {
    // Không đọc được body (proxy trả HTML): giữ hành vi cũ là thử lại một lần.
    return true;
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
  const pending = requestRefresh()
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
  // Chụp "thế hệ" phiên TRƯỚC mọi await: request thuộc phiên nào thì 401 về muộn cũng không
  // được xóa token của phiên mới (đăng nhập/đăng xuất trong lúc request đang bay).
  const generation = tokenGeneration;
  // F5: chờ phiên khôi phục xong rồi mới gửi, thay vì bắn đi thiếu `Authorization` (xem
  // `restoreSession`). `/auth/*` không cần token nên bỏ qua để không chờ chính nó.
  if (!path.startsWith('/auth/')) await waitForSession();
  // Token dùng cho lần gửi đầu: 401 về muộn có thể chỉ vì request này mang token CŨ trong khi
  // request khác đã refresh xong. Khi đó gửi lại bằng token mới, KHÔNG xoay vòng thêm lần nữa —
  // mỗi lần xoay vòng thừa là một cơ hội mất Set-Cookie lúc trang điều hướng.
  let sentToken = accessToken;
  let res = await send(method, path, body, options);

  // Access token hết hạn (15 phút): refresh một lần rồi thử lại đúng một lần.
  // Bỏ qua /auth/*: login sai mật khẩu cũng là 401, refresh ở đó sẽ thành vòng lặp.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (generation === tokenGeneration && accessToken && accessToken !== sentToken) {
      sentToken = accessToken;
      res = await send(method, path, body, options);
    }
    if (res.status === 401 && generation === tokenGeneration) {
      if ((await refreshAccessToken()) && generation === tokenGeneration) {
        res = await send(method, path, body, options);
      }
      if (res.status === 401 && generation === tokenGeneration) {
        expireSession();
      }
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
  // TG.8: hành động vòng đời tài khoản trả 200/202 với body rỗng (quên mật khẩu luôn 202,
  // xác minh email 204) — đọc JSON chỉ khi có nội dung, body rỗng coi như undefined.
  const text = await res.text();
  if (text === '') {
    return undefined as T;
  }
  const data: unknown = JSON.parse(text);
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
    // Upload cũng đi qua hàng đợi (ADR-0078): file lớn chiếm suất lâu hơn request thường,
    // và cần dừng khi cả API đang bị khóa vì 429.
    const run = async () => {
      await acquireSlot(signal);
      try {
        return await new Promise<void>((resolve, reject) => {
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
            noteRateLimit({
              status: xhr.status,
              retryAfter: xhr.getResponseHeader('Retry-After'),
              remaining: xhr.getResponseHeader('X-RateLimit-Remaining'),
              reset: xhr.getResponseHeader('X-RateLimit-Reset'),
            });
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else
              void toApiError(new Response(xhr.responseText, { status: xhr.status })).then(reject);
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
      } finally {
        releaseSlot();
      }
    };
    try {
      await waitForSession();
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
