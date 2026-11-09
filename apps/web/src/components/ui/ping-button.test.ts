import { readFileSync } from 'node:fs';
import { ConfigProvider } from 'antd';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PingButton, VARIANTS } from './ping-button';
import { PingIconButton } from './ping-icon-button';

const SAME_AS_SECONDARY_IN_DEFAULT = ['info', 'success'];
const NATIVE_LOOK_IN_SKINS = ['text'];
const pop = readFileSync(new URL('../../styles/skin-pop.css', import.meta.url), 'utf8');

const inLarge = (element: ReactElement) =>
  renderToStaticMarkup(h(ConfigProvider, { componentSize: 'large' }, element));

describe('PingButton', () => {
  it('chốt đúng bảy biến thể và ánh xạ sang antd', () => {
    expect(Object.keys(VARIANTS).sort()).toEqual([
      'danger',
      'ghost',
      'info',
      'primary',
      'secondary',
      'success',
      'text',
    ]);
    expect(VARIANTS).toEqual({
      primary: { type: 'primary' },
      secondary: { type: 'default' },
      success: { type: 'default' },
      info: { type: 'default' },
      danger: { type: 'default', danger: true },
      ghost: { type: 'dashed' },
      text: { type: 'text' },
    });
  });

  it('mỗi biến thể ngoài primary/secondary/text đều có luật ở skin Pop', () => {
    const exempt = ['primary', 'secondary', ...NATIVE_LOOK_IN_SKINS];
    for (const name of Object.keys(VARIANTS).filter((v) => !exempt.includes(v))) {
      expect(pop, name).toContain(`[data-variant='${name}']`);
    }
  });

  it('biến thể trùng ánh xạ với secondary phải nằm trong danh sách chủ ý', () => {
    const same = Object.entries(VARIANTS)
      .filter(
        ([name, props]) =>
          name !== 'secondary' && JSON.stringify(props) === JSON.stringify(VARIANTS.secondary),
      )
      .map(([name]) => name)
      .sort();
    expect(same).toEqual(SAME_AS_SECONDARY_IN_DEFAULT);
  });

  it('không truyền size thì theo ConfigProvider; truyền size thì thắng context', () => {
    expect(inLarge(h(PingButton, { variant: 'primary' }, 'x'))).toContain('ant-btn-lg');
    const small = inLarge(h(PingButton, { variant: 'primary', size: 'sm' }, 'x'));
    expect(small).toContain('ant-btn-sm');
    expect(small).not.toContain('ant-btn-lg');
  });

  it('PingIconButton đi qua PingButton: biến thể text, testid riêng, size theo context', () => {
    const html = renderToStaticMarkup(
      h(PingIconButton, { icon: null, 'aria-label': 'Đóng', size: 'sm' }),
    );
    expect(html).toContain('data-variant="text"');
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-testid="ping-icon-button"');
    expect(html).toContain('ant-btn-sm');
    expect(
      renderToStaticMarkup(
        h(PingIconButton, { icon: null, 'aria-label': 'x', 'data-testid': 'mine' }),
      ),
    ).toContain('data-testid="mine"');
  });

  it('phát data-slot và data-variant', () => {
    const html = renderToStaticMarkup(h(PingButton, { variant: 'danger' }, 'x'));
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-variant="danger"');
  });
});
