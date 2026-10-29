import { VerifyEmailPanel } from '@/features/auth/components/verify-email';

/** Xác minh email từ liên kết trong thư: /verify?token=... (TG.8). Trang công khai. */
export default function VerifyEmailPage() {
  return <VerifyEmailPanel />;
}
