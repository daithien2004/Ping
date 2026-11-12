import { DmEmpty } from '@/features/dms/components/dm-empty';

/**
 * URL "/channels/@me" (route nội bộ "/dms", ADR-0088): chưa chọn hội thoại nào — gợi ý entry chính là nút "Nhắn tin" trong thẻ hồ sơ
 * thành viên (TG.9, entry duy nhất để tạo DM mới ở v0.2).
 */
export default function DmsPage() {
  return <DmEmpty />;
}
