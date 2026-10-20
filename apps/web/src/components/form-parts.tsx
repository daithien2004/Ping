import type { ReactNode } from 'react';

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
