/**
 * Hạn mức rate limit theo nhóm route (ADR-0080).
 *
 * Trước ADR-0080 cả API dùng một cửa sổ `100/phút` khóa 60 giây. Một đợt burst đọc nhẹ (unread,
 * permissions) và một lần upload cùng ăn chung một bộ đếm, nên một request nặng khóa cả phút cho
 * mọi request khác. Ở đây tách theo chi phí thật của từng nhóm: đọc nhẹ rộng, ghi cấu trúc chặt,
 * và khóa chỉ 2–10 giây để client tự điều tiết theo `Retry-After` thay vì dừng cả phút.
 *
 * `ttl` / `blockDuration` tính bằng MILISECONDS (guard dịch sang giây khi ghi header).
 * Khoá đếm vẫn là cặp (route, handler) như mặc định của `@nestjs/throttler` cộng thêm danh tính
 * người gọi — xem `HttpThrottlerGuard.getTracker`.
 */
export const RATE_LIMIT_BUCKETS = {
  /** GET rẻ, gọi nhiều lần mỗi lần tải trang: unread, danh sách server, kênh, thành viên, quyền. */
  readLight: { limit: 240, ttl: 60_000, blockDuration: 3_000 },
  /** Đọc nội dung: lịch sử tin nhắn, ghim, người đã thả cảm xúc, đánh dấu đã đọc. */
  history: { limit: 120, ttl: 60_000, blockDuration: 2_000 },
  /** Tìm kiếm FTS + trigram quét cả server: trần riêng thấp (dịch vụ còn có SearchRateLimiter 30/phút). */
  search: { limit: 40, ttl: 60_000, blockDuration: 10_000 },
  /** Ghi nội dung: gửi/sửa/xóa tin, thả/gỡ cảm xúc, ghim/bỏ ghim. Cửa sổ ngắn theo đợt chat. */
  writeMessage: { limit: 60, ttl: 10_000, blockDuration: 3_000 },
  /** Ghi cấu trúc: server/kênh/role/category/lời mời/ban/kick/thành viên, đổi mật khẩu, phiên. */
  writeStructure: { limit: 20, ttl: 60_000, blockDuration: 10_000 },
  /** Upload: tạo phiên, đẩy byte, hoàn tất/hủy, xem trạng thái. */
  uploads: { limit: 30, ttl: 60_000, blockDuration: 5_000 },
  /**
   * Byte tệp đính kèm (link ký sẵn, ảnh thumbnail): một kênh nhiều ảnh bắn hàng trăm request.
   * Luôn khoá theo IP (`@RateLimitByIp`) vì `/file` không có header Authorization.
   */
  attachmentRead: { limit: 600, ttl: 60_000, blockDuration: 2_000 },
  /** Đăng nhập: mỗi lần thử là một argon2.verify tốn CPU. */
  authCredential: { limit: 10, ttl: 60_000, blockDuration: 60_000 },
  /** Đăng ký: argon2.hash còn đắt hơn verify; giữ trần cũ 5/phút (trước ADR-0080). */
  authRegister: { limit: 5, ttl: 60_000, blockDuration: 60_000 },
  /** Vòng đời phiên (refresh/logout) bằng cookie httpOnly, không có Authorization header. */
  authSession: { limit: 30, ttl: 60_000, blockDuration: 5_000 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS;
