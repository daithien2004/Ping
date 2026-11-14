import * as Sentry from '@sentry/node';

type Event = Sentry.ErrorEvent;

// Bỏ body, cookie, header, query string (có thể chứa nội dung tin nhắn); chỉ giữ id user và tag requestId.
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

// DSN rỗng = tắt hẳn, không khởi tạo SDK.
export function initSentry(dsn: string | undefined): boolean {
  if (!dsn) return false;
  Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent });
  return true;
}

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
