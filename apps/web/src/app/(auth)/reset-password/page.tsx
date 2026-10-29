import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

/** Đặt lại mật khẩu từ liên kết trong thư: /reset-password?token=... (TG.8). Trang công khai. */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
