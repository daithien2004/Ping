'use client';

import type { ButtonHTMLAttributes } from 'react';

const BASE =
  'focus-ring grid size-8 shrink-0 place-items-center transition-colors disabled:opacity-50';

const VARIANTS = {
  ghost: 'rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
  bordered:
    'rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground',
  primary: 'rounded-md bg-primary text-primary-foreground hover:bg-primary/90',
} as const;

export function ComposerIconButton({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />
  );
}
