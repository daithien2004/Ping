import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GlobalErrorView } from './global-error-view';

const render = (locale: 'vi' | 'en', reference?: string) =>
  renderToStaticMarkup(
    createElement(GlobalErrorView, { locale, reference, onRetry: () => undefined }),
  );

describe('GlobalErrorView (root layout failed: no providers, no i18n context)', () => {
  it('speaks Vietnamese and English from messages/*.json', () => {
    expect(render('vi')).toContain('Đã xảy ra lỗi nghiêm trọng');
    expect(render('en')).toContain('A fatal error occurred');
  });

  it('shows the error reference only when there is one', () => {
    expect(render('vi', 'req-77')).toContain('Mã lỗi: req-77');
    expect(render('en', 'req-77')).toContain('Error ID: req-77');
    expect(render('vi')).not.toContain('Mã lỗi');
  });

  it('is a full document (global-error replaces the root layout) with the right lang and a retry button', () => {
    const html = render('en');
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<button');
  });
});
