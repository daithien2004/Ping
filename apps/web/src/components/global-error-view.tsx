import { messagesByLocale, type AppLocale } from '@/i18n/config';

/**
 * Giao diện của global-error.tsx. Component này thay THẾ cả root layout khi nó lỗi, nên chạy mà
 * không có Providers, không có IntlProvider, không có Tailwind token nào được đảm bảo: chữ lấy thẳng
 * từ messages/*.json (vẫn một nguồn dịch, test đồng bộ key áp dụng) và style tối giản viết inline.
 */
export function GlobalErrorView({
  locale,
  reference,
  onRetry,
}: {
  locale: AppLocale;
  reference?: string;
  onRetry: () => void;
}) {
  const messages = messagesByLocale[locale];
  return (
    <html lang={locale}>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 24,
          background: '#1f1f26',
          color: '#ececf1',
        }}
      >
        <main role="alert" style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>{messages.app.fatalTitle}</h1>
          <p style={{ margin: '0 0 12px', color: '#b4b4c0' }}>{messages.app.fatalHint}</p>
          {reference ? (
            <p style={{ margin: '0 0 16px', fontSize: 13 }}>
              <code>{messages.app.errorId.replace('{id}', reference)}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#7b6cf0',
              color: '#fff',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {messages.common.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
