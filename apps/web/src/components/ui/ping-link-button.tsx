'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import type { MouseEvent, Ref } from 'react';
import { VARIANTS, type PingButtonProps } from './ping-button';
import { toAntdSize } from './size';

export interface PingLinkButtonProps extends Omit<PingButtonProps, 'htmlType' | 'loading' | 'ref'> {
  /** Chỉ đường dẫn nội bộ; liên kết ngoài dùng thẻ <a> thường. */
  href: string;
  ref?: Ref<HTMLAnchorElement>;
}

const isPlainLeftClick = (event: MouseEvent<HTMLElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** Giữ <a> thật (mở tab mới, chuột giữa) nhưng điều hướng phía client khi bấm thường. */
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
