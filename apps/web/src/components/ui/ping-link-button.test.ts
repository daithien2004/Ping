import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { PingLinkButton, isPlainLeftClick } = await import('./ping-link-button');

const click = (over: Partial<Parameters<typeof isPlainLeftClick>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('PingLinkButton', () => {
  it('chỉ bấm trái thuần mới do ta điều hướng', () => {
    expect(isPlainLeftClick(click())).toBe(true);
    for (const over of [
      { button: 1 },
      { button: 2 },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      expect(isPlainLeftClick(click(over)), JSON.stringify(over)).toBe(false);
    }
  });

  it('render <a href> thật với hợp đồng của nút', () => {
    const html = renderToStaticMarkup(
      h(PingLinkButton, { variant: 'primary', href: '/servers' }, 'Về trang chủ'),
    );
    expect(html).toContain('<a ');
    expect(html).toContain('href="/servers"');
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-variant="primary"');
  });
});
