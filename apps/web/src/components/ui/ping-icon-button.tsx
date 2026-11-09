'use client';

import type { ReactNode } from 'react';
import { PingButton, type PingButtonProps } from './ping-button';

/** `aria-label` bắt buộc và không có `children`: nút chỉ có icon phải có tên truy cập. */
export type PingIconButtonProps = Omit<PingButtonProps, 'variant' | 'children'> & {
  icon: ReactNode;
  'aria-label': string;
};

export function PingIconButton(props: PingIconButtonProps) {
  return <PingButton data-testid="ping-icon-button" {...props} variant="text" />;
}
