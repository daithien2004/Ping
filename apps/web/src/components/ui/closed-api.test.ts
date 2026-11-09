import { createElement } from 'react';
import { describe, it } from 'vitest';
import { PingDrawer } from './ping-drawer';
import { PingForm } from './ping-form';
import { PingIconButton } from './ping-icon-button';
import { PingPasswordInput } from './ping-password-input';
import { PingPopconfirm } from './ping-popconfirm';
import type { PingTableColumn } from './ping-table';

// API đóng được khóa ở mức kiểu: dòng @ts-expect-error đỏ ở `tsc` nếu ai mở prop antd ra lại.
describe('API đóng của wrapper', () => {
  it('PingDrawer không nhận prop antd ngoài danh sách', () => {
    createElement(PingDrawer, {
      open: false,
      // @ts-expect-error `placement` không thuộc API đóng
      placement: 'left',
    });
    createElement(PingDrawer, {
      open: false,
      // @ts-expect-error `styles` không thuộc API đóng
      styles: {},
    });
  });

  it('PingIconButton bắt buộc aria-label và không nhận children', () => {
    // @ts-expect-error thiếu `aria-label`
    createElement(PingIconButton, { icon: null });
    // eslint-disable-next-line react/no-children-prop -- cố ý truyền sai để khóa kiểu
    createElement(PingIconButton, {
      icon: null,
      'aria-label': 'x',
      // @ts-expect-error nút icon không có `children`
      children: 'x',
    });
  });

  it('PingPasswordInput không nhận prop antd ngoài danh sách', () => {
    createElement(PingPasswordInput, {
      autoComplete: 'new-password',
      // @ts-expect-error `visibilityToggle` không thuộc API đóng
      visibilityToggle: false,
    });
  });

  it('PingForm không lộ cỡ antd', () => {
    createElement(PingForm, {
      // @ts-expect-error `size` của antd không thuộc API Ping
      size: 'small',
    });
  });

  it('PingPopconfirm không nhận prop antd ngoài danh sách', () => {
    createElement(PingPopconfirm, {
      title: 't',
      // @ts-expect-error `placement` không thuộc API đóng
      placement: 'left',
    });
  });

  it('PingTableColumn: cột không có render phải dùng field thật', () => {
    type Row = { id: string; name: string };
    const ok: PingTableColumn<Row>[] = [
      { key: 'name', header: 'Tên' },
      { key: 'actions', header: '', render: (row) => row.id },
    ];
    // @ts-expect-error `nam` không phải field của Row và không có `render`
    const typo: PingTableColumn<Row> = { key: 'nam', header: 'Tên' };
    void [ok, typo];
  });
});
