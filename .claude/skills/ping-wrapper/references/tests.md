# Test cho wrapper

Repo không có jsdom/happy-dom/testing-library. Dùng vitest môi trường node và `renderToStaticMarkup` từ `react-dom/server`, không thêm dependency.

## Test ConfigProvider / size

```ts
import { ConfigProvider } from 'antd';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PingButton } from './ping-button';

const inLarge = (el: ReactElement) =>
  renderToStaticMarkup(h(ConfigProvider, { componentSize: 'large' }, el));

it('không truyền size thì theo ConfigProvider; truyền size thì thắng context', () => {
  expect(inLarge(h(PingButton, { variant: 'primary' }, 'x'))).toContain('ant-btn-lg');
  const sm = inLarge(h(PingButton, { variant: 'primary', size: 'sm' }, 'x'));
  expect(sm).toContain('ant-btn-sm');
  expect(sm).not.toContain('ant-btn-lg');
});
```

Chạy thật trong repo: `'use client'` và alias import có thể cần cấu hình vitest.

## Test ánh xạ VARIANTS (không cần DOM)

- Chốt từng dòng ánh xạ.
- Chốt **cả số lượng**: `Object.keys(VARIANTS)` bằng đúng danh sách mong đợi, để việc thêm/bớt biến thể buộc phải hiện trong diff.

## Test phủ skin (đặt cùng commit với luật skin)

Đọc file CSS của từng skin dưới dạng text; với mỗi biến thể trong `VARIANTS`, kiểm tra có `[data-variant='<tên>']`. Biến thể cố ý rơi về secondary ở skin mặc định thì ghi vào một danh sách tường minh (vd `SAME_AS_SECONDARY_IN_DEFAULT`) để ai đổi ánh xạ phải sửa test có chủ đích.

## Test không lộ cỡ antd

Duyệt các wrapper (hoặc grep nguồn) để chắc `'small' | 'middle' | 'large'` không xuất hiện trong kiểu công khai; chỉ `size.ts` được biết chúng.

## Lưu ý

- Cây phải xanh ở từng commit: đừng thêm test phủ skin trước khi luật skin tồn tại.
- Chưa chạy thì nói rõ là chưa chạy.
