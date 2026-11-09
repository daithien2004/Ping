import { readFileSync } from 'node:fs';
import { ConfigProvider } from 'antd';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PingButton, VARIANTS } from './ping-button';

const inLarge = (element: ReactElement) =>
  renderToStaticMarkup(h(ConfigProvider, { componentSize: 'large' }, element));

describe('PingButton', () => {
  it('chốt đúng bốn biến thể và ánh xạ sang antd', () => {
    expect(Object.keys(VARIANTS).sort()).toEqual(['danger', 'ghost', 'primary', 'secondary']);
    expect(VARIANTS).toEqual({
      primary: { type: 'primary' },
      secondary: { type: 'default' },
      danger: { type: 'default', danger: true },
      ghost: { type: 'default' },
    });
  });

  it('chưa có luật skin nào bám ghost (sẽ đổi hình)', () => {
    const pop = readFileSync(new URL('../../styles/skin-pop.css', import.meta.url), 'utf8');
    expect(pop).not.toContain("[data-variant='ghost']");
  });

  it('không truyền size thì theo ConfigProvider; truyền size thì thắng context', () => {
    expect(inLarge(h(PingButton, { variant: 'primary' }, 'x'))).toContain('ant-btn-lg');
    const small = inLarge(h(PingButton, { variant: 'primary', size: 'sm' }, 'x'));
    expect(small).toContain('ant-btn-sm');
    expect(small).not.toContain('ant-btn-lg');
  });

  it('phát data-slot và data-variant', () => {
    const html = renderToStaticMarkup(h(PingButton, { variant: 'danger' }, 'x'));
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-variant="danger"');
  });
});
