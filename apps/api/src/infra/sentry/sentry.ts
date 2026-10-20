import * as Sentry from '@sentry/node';

type Event = Sentry.ErrorEvent;

/**
 * Chạy ngay trước khi Sentry gửi sự kiện (ADR-0031, quy tắc 11): bỏ mọi thứ có thể chứa nội dung
 * tin nhắn hay bí mật — body, cookie, header, query string — và chỉ giữ id của user. Giữ tag
 * `requestId` để từ lỗi trên Sentry tra được log backend.
 */
export function scrubEvent(event: Event): Event | null {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: url?.split('?')[0] };
  }
  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }
  if (event.tags) {
    const { requestId } = event.tags;
    event.tags = requestId === undefined ? {} : { requestId };
  }
  return event;
}

/**
 * DSN rỗng = tắt hẳn: không khởi tạo SDK nên không có hook, không mạng, không overhead.
 * Không bật tracing (tracesSampleRate 0); mọi sự kiện đi qua scrubEvent.
 */
export function initSentry(dsn: string | undefined): boolean {
  if (!dsn) return false;
  Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent });
  return true;
}

/** Gửi một lỗi 500 bất ngờ, gắn requestId (và userId nếu có). Không làm gì khi Sentry tắt. */
export function captureServerError(
  error: unknown,
  { requestId, userId }: { requestId: string; userId?: string },
): void {
  if (!Sentry.isEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag('requestId', requestId);
    if (userId) scope.setUser({ id: userId });
    Sentry.captureException(error);
  });
}
