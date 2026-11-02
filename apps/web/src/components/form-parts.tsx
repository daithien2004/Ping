import { type ReactNode, useId } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingLabel } from '@/components/ui/ping-label';

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  errors?: string[];
}

/** Ô nhập có nhãn liên kết bằng aria-describedby để trình đọc màn hình đọc lỗi. */
export function Field({ label, name, type = 'text', autoComplete, errors }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <PingLabel htmlFor={id}>{label}</PingLabel>
      <PingInput
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
      />
      {errors && (
        <span id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </span>
      )}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  const t = useTranslations('common');
  return (
    <PingButton htmlType="submit" size="lg" disabled={pending}>
      {pending ? t('processing') : children}
    </PingButton>
  );
}
