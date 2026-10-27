/**
 * Trần số lượng (ADR-0028): chặn tăng trưởng không giới hạn của các danh sách không phân trang và
 * của số thứ một user/server có thể tạo. Vượt trần → 400 VALIDATION_ERROR kèm `details`.
 */
export const Limits = {
  MAX_CHANNELS_PER_SERVER: 200,
  MAX_ROLES_PER_SERVER: 100,
  MAX_SERVERS_PER_USER: 100,
  /** Số mention khác nhau tối đa mỗi tin (T4.1, ADR-0043): vượt phần sau bị bỏ qua. */
  MENTIONS_PER_MESSAGE: 20,
  /** Trần độ dài truy vấn tìm kiếm (T4.6, ADR-0045). */
  SEARCH_QUERY_MAX: 200,
  /** Số loại cảm xúc khác nhau tối đa trên một tin (TG.2, ADR-0064). */
  REACTIONS_PER_MESSAGE: 20,
  /** Số tin được ghim tối đa trong một channel (TG.3, ADR-0066). */
  PINS_PER_CHANNEL: 50,
  /** Số sticker còn sống tối đa mỗi server (TG.22, ADR-0067); xóa mềm thì giải phóng chỉ tiêu. */
  STICKERS_PER_SERVER: 30,
} as const;
