'use client';

import { Input } from 'antd';
import { forwardRef } from 'react';

export interface PingPasswordInputProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const PingPasswordInput = forwardRef<HTMLInputElement, PingPasswordInputProps>(
  function PingPasswordInput({ value, onChange, placeholder, disabled, className }, ref) {
    return (
      <Input.Password
        ref={ref as never}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        data-testid="ping-password-input"
      />
    );
  },
);
