/**
 * Trần số lượng (ADR-0028): chặn tăng trưởng không giới hạn của các danh sách không phân trang và
 * của số thứ một user/server có thể tạo. Vượt trần → 400 VALIDATION_ERROR kèm `details`.
 */
export const Limits = {
  MAX_CHANNELS_PER_SERVER: 200,
  MAX_ROLES_PER_SERVER: 100,
  MAX_SERVERS_PER_USER: 100,
} as const;
