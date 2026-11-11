import type { DmSummary } from '@ping/shared';

/** Trang DM đang ở trạng thái nào. Thêm một trạng thái mới là thêm một nhánh union ở đây. */
export type DmViewState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'notFound' } | { kind: 'ready'; dm: DmSummary };

/**
 * Chọn trạng thái từ kết quả `useDms` và channel đang mở.
 *
 * Tải xong mà không có hội thoại nào khớp thì là `notFound`: DM của người khác được API trả 404
 * nên client cũng chỉ nói "không tìm thấy", không lộ là nó có tồn tại hay không (IDOR an toàn).
 */
export function dmViewState({
  isPending,
  isError,
  dms,
  channelId,
}: {
  isPending: boolean;
  isError: boolean;
  dms: DmSummary[] | undefined;
  channelId: string;
}): DmViewState {
  if (isPending) return { kind: 'loading' };
  if (isError) return { kind: 'error' };
  const dm = dms?.find((row) => row.channelId === channelId);
  if (dm) return { kind: 'ready', dm };
  return dms ? { kind: 'notFound' } : { kind: 'loading' };
}
