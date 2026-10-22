'use client';

import { Button } from 'antd';
import { forwardRef, type ReactNode } from 'react';

export interface PingIconButtonProps {
  icon: ReactNode;
  'aria-label': string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const PingIconButton = forwardRef<HTMLButtonElement, PingIconButtonProps>(
  function PingIconButton(
    { icon, 'aria-label': ariaLabel, onClick, disabled, loading, className },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type="text"
        icon={icon}
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
        className={className}
        data-testid="ping-icon-button"
      />
    );
  },
);
