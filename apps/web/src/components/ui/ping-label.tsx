'use client';

import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Nhãn của ô nhập. antd không có Label rời (Form.Item tự vẽ), nên đây là phần tử gốc theo token. */
export const PingLabel = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function PingLabel({ className, htmlFor, ...rest }, ref) {
    return (
      // htmlFor truyền thẳng xuống đây (không nằm trong spread) để jsx-a11y thấy liên kết với control.
      <label
        ref={ref}
        htmlFor={htmlFor}
        data-testid="ping-label"
        className={cn(
          'flex items-center gap-2 text-sm leading-none font-medium select-none',
          className,
        )}
        {...rest}
      />
    );
  },
);
