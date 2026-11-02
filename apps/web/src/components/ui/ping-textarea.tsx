'use client';

import { Input } from 'antd';
import { forwardRef, type ComponentProps } from 'react';

/** Truyền nguyên props của antd TextArea (id, aria-invalid, value, onChange…); chỉ thêm testid. */
export type PingTextAreaProps = ComponentProps<typeof Input.TextArea> & {
  'data-testid'?: string;
};

export const PingTextArea = forwardRef<HTMLTextAreaElement, PingTextAreaProps>(
  function PingTextArea({ className, 'data-testid': testId, ...rest }, ref) {
    return (
      <Input.TextArea
        ref={ref as never}
        className={className}
        data-testid={testId ?? 'ping-textarea'}
        {...rest}
      />
    );
  },
);
