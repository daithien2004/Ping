'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import type { MouseEvent, Ref } from 'react';
import { VARIANTS, type PingButtonProps } from './ping-button';
import { toAntdSize } from './size';

export interface PingLinkButtonProps extends Omit<PingButtonProps, 'htmlType' | 'loading' | 'ref'> {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
}

export const isPlainLeftClick = (
  event: Pick<MouseEvent<HTMLElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * Antd render `<a href>`; bấm trái thuần thì `router.push`, phím phụ và chuột giữa để trình duyệt
 * xử lý. Không dùng `<Link>` vì `<a><button>` là HTML sai và antd `Button` không đổi được thẻ gốc.
 * Giới hạn: không prefetch; nếu dùng cho điều hướng thường xuyên thì xét `<Link>` kèm class nút
 * hoặc `router.prefetch(href)`. Chỉ đường dẫn nội bộ.
 */
export function PingLinkButton({
  variant,
  size,
  href,
  onClick,
  'data-testid': testId = 'ping-link-button',
  ...rest
}: PingLinkButtonProps) {
  const router = useRouter();
  return (
    <Button
      {...rest}
      {...VARIANTS[variant]}
      href={href}
      size={size ? toAntdSize(size) : undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-testid={testId}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && isPlainLeftClick(event)) {
          event.preventDefault();
          router.push(href);
        }
      }}
    />
  );
}
