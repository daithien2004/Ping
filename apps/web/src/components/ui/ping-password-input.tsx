'use client';

import { Input, type InputRef } from 'antd';
import type { ChangeEvent, Ref } from 'react';

export interface PingPasswordInputProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  ref?: Ref<InputRef>;
}

export function PingPasswordInput(props: PingPasswordInputProps) {
  return <Input.Password {...props} data-testid="ping-password-input" />;
}
