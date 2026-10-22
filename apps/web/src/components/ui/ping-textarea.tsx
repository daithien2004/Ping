'use client';

import { Input } from 'antd';
import { forwardRef } from 'react';

export interface PingTextAreaProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  maxLength?: number;
  'aria-label'?: string;
  'data-testid'?: string;
}

export const PingTextArea = forwardRef<HTMLTextAreaElement, PingTextAreaProps>(
  function PingTextArea(
    {
      value,
      onChange,
      onKeyDown,
      placeholder,
      rows = 3,
      disabled,
      className,
      autoSize,
      maxLength,
      'aria-label': ariaLabel,
      'data-testid': testId,
    },
    ref,
  ) {
    return (
      <Input.TextArea
        ref={ref as never}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
        autoSize={autoSize}
        maxLength={maxLength}
        aria-label={ariaLabel}
        data-testid={testId}
      />
    );
  },
);
