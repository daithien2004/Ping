import type { ErrorEvent } from '@sentry/browser';
import { errorReference } from './error-reference';

type SentryBrowser = typeof import('@sentry/browser');
let sentry: SentryBrowser | undefined;

/**
 * Chạy ngay trước khi Sentry gửi (ADR-0031, quy tắc 11): bỏ body/header/cookie/query/breadcrumb (có thể
 * chứa nội dung tin nhắn), không gửi thông tin user; chỉ giữ URL không query và tag `requestId` để tra
 * log backend.
 */
export function scrubBrowserEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request?.url) event.request = { url: event.request.url.split('?')[0] };
  else delete event.request;
  event.user = {};
  const requestId = event.tags?.requestId;
  event.tags = requestId === undefined ? {} : { requestId };
  delete event.breadcrumbs;
  return event;
}

/**
 * DSN rỗng = tắt hẳn: SDK không được tải (import động), không mạng, không overhead. Có DSN thì tải SDK
 * ở chunk riêng, tắt breadcrumb và tracing; lỗi chưa bắt (window.onerror) do SDK tự gửi.
 */
export async function initSentryBrowser(dsn: string | undefined): Promise<boolean> {
  if (!dsn) return false;
  const sdk = await import('@sentry/browser');
  sdk.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend: scrubBrowserEvent,
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== 'Breadcrumbs'),
  });
  sentry = sdk;
  return true;
}

/** Gửi lỗi kèm mã tham chiếu (requestId/digest). Không làm gì khi Sentry chưa bật. */
export function captureBrowserError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!sentry) return;
  const requestId = errorReference(error);
  sentry.withScope((scope) => {
    if (requestId) scope.setTag('requestId', requestId);
    if (typeof context.boundary === 'string') scope.setTag('boundary', context.boundary);
    sentry!.captureException(error);
  });
}
