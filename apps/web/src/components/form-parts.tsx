import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Xóa form khi nó bị ẩn hoặc gỡ. <Activity> (cacheComponents) GIẤU trang đã rời chứ không gỡ:
 * form đăng nhập/đăng ký ẩn vẫn giữ mật khẩu trong DOM (e2e đã bắt được). Ẩn = cleanup của effect
 * chạy, nên reset ở cleanup bao cả hai ca: đăng nhập xong và gõ dở rồi chuyển trang.
 */
export function useClearOnHide(): RefObject<HTMLFormElement | null> {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    return () => form?.reset();
  }, []);
  return ref;
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  errors?: string[];
}

/** Ô nhập có nhãn và lỗi gắn bằng aria-describedby để trình đọc màn hình đọc được lỗi. */
export function Field({ label, name, type = 'text', autoComplete, errors }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
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
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? t('processing') : children}
    </Button>
  );
}
