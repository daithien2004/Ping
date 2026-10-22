'use client';

import { Input } from 'antd';
import { forwardRef } from 'react';

export interface PingPasswordInputProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** `id`/`name`/`autoComplete` cần cho `<label>` liên kết và trình duyệt gợi ý mật khẩu. */
  id?: string;
  name?: string;
  autoComplete?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export const PingPasswordInput = forwardRef<HTMLInputElement, PingPasswordInputProps>(
  function PingPasswordInput(
    {
      value,
      onChange,
      placeholder,
      disabled,
      className,
      id,
      name,
      autoComplete,
      'aria-label': ariaLabel,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedBy,
    },
    ref,
  ) {
    return (
      <Input.Password
        ref={ref as never}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        id={id}
        name={name}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        data-testid="ping-password-input"
      />
    );
  },
);
