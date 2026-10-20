import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

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
  const errorId = `${name}-error`;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-transparent"
      />
      {errors && (
        <span id={errorId} className="text-red-600">
          {errors[0]}
        </span>
      )}
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Đang xử lý…' : children}
    </button>
  );
}
