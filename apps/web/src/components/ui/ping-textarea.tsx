'use client';

import { Input } from 'antd';
import { forwardRef } from 'react';

export interface PingTextAreaProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export const PingTextArea = forwardRef<HTMLTextAreaElement, PingTextAreaProps>(
  function PingTextArea({ value, onChange, placeholder, rows = 3, disabled, className }, ref) {
    return (
      <Input.TextArea
        ref={ref as never}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
        data-testid="ping-textarea"
      />
    );
  },
);
