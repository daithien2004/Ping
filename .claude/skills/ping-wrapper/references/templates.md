# Mẫu code

## Mục lục

- size.ts
- Wrapper có biến thể (PingButton)
- CSS dùng chung
- CSS skin

## components/ui/size.ts

```ts
export type PingSize = 'sm' | 'md' | 'lg';

const ANTD_SIZE = { sm: 'small', md: 'middle', lg: 'large' } as const;

/**
 * Đổi cỡ Ping sang cỡ antd. Chỉ gọi khi có `size`: bỏ trống thì antd tự lấy từ
 * ConfigProvider / Space.Compact / Button.Group.
 */
export const toAntdSize = (size: PingSize) => ANTD_SIZE[size];
```

## Wrapper có biến thể (PingButton)

```tsx
'use client';

import { Button } from 'antd';
import type { ComponentProps, Ref } from 'react';
import { toAntdSize, type PingSize } from './size';

type AntdButtonProps = ComponentProps<typeof Button>;

/**
 * Hợp đồng duy nhất: biến thể Ping → props antd. Kiểu biến thể suy ra từ đây.
 * - `danger` và `ghost` không kết hợp được (chủ ý: một biến thể = một vẻ).
 * - Skin không định nghĩa style cho biến thể chỉ khác nhờ CSS sẽ hiển thị như `secondary`.
 * - Wrapper không có class mặc định; nếu sau này thêm thì quay lại dùng `cn` để gộp `className`.
 */
export const VARIANTS = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  danger: { type: 'default', danger: true },
} as const satisfies Record<string, Pick<AntdButtonProps, 'type' | 'danger'>>;

export type PingButtonVariant = keyof typeof VARIANTS;

export interface PingButtonProps extends Omit<
  AntdButtonProps,
  'type' | 'size' | 'danger' | 'ghost' | 'shape' | 'color' | 'variant' | 'href' | 'target' | 'ref'
> {
  /** Bắt buộc: không có default ngầm. */
  variant: PingButtonVariant;
  /** Tùy chọn: bỏ trống thì antd lấy từ ConfigProvider / Space.Compact / Button.Group. */
  size?: PingSize;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * `data-slot`, `data-variant` đứng sau `rest` nên người gọi không đè được.
 * `data-size` chỉ có khi truyền `size` tường minh: KHÔNG để CSS skin phụ thuộc vào nó.
 */
export function PingButton({
  variant,
  size,
  'data-testid': testId = 'ping-button',
  ...rest
}: PingButtonProps) {
  return (
    <Button
      {...rest}
      {...VARIANTS[variant]}
      size={size ? toAntdSize(size) : undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-testid={testId}
    />
  );
}
```

## CSS dùng chung

```css
/* Icon theo font-size của nút, không chặn chuột. Trong @layer để utility của người gọi thắng. */
@layer components {
  [data-slot='button'] > svg,
  [data-slot='button'] > .ant-btn-icon > svg {
    width: 1em;
    height: 1em;
    pointer-events: none;
  }
}
```

Kiểm tra DOM thật của antd trước khi chốt selector (antd 6.6.7: `button > span.ant-btn-icon > svg`; icon loading là `.anticon > svg`).

## CSS skin

```css
html[data-skin='pop'] [data-slot='button'][data-variant='danger']:not(:disabled) { ... }
html[data-skin='pop'] [data-slot='button'][data-variant='success'] { ... }
```
