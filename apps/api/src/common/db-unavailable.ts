/**
 * Nhận diện lỗi "Postgres không dùng được" (chết, không với tới, quá hạn, hết kết nối) để
 * trả 503 thay vì 500 (ADR-0026). Lỗi dữ liệu (P2002, P2025, vi phạm ràng buộc…) KHÔNG thuộc nhóm
 * này: đó là lỗi của request chứ không phải của hạ tầng.
 *
 * Hình dạng lỗi lấy từ thực nghiệm với Prisma 7 + @prisma/adapter-pg 7.10:
 * - không với tới DB: PrismaClientKnownRequestError với `code` là mã hệ thống ('ECONNREFUSED'…);
 * - statement_timeout: `code` P2010 (raw) / P2039 (model), mã Postgres nằm ở
 *   `meta.driverAdapterError.cause.originalCode` ('57014');
 * - query_timeout / hết pool / mất kết nối giữa chừng: Error thường của thư viện `pg`.
 */
const SYSTEM_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
const PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
// 57014 query_canceled (statement_timeout), 57P01..03 server đang tắt/khởi động lại,
// 53300 too_many_connections, 08xxx lỗi kết nối.
const POSTGRES_CODES = new Set([
  '57014',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '08000',
  '08003',
  '08006',
]);
const PG_CLIENT_MESSAGE =
  /Query read timeout|timeout exceeded when trying to connect|Connection terminated|Connection (?:closed|ended)/i;

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const { code, meta } = error as { code?: unknown; meta?: unknown };
  if (typeof code === 'string' && (SYSTEM_CODES.has(code) || PRISMA_CODES.has(code))) {
    return true;
  }
  const originalCode = (
    meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined
  )?.driverAdapterError?.cause?.originalCode;
  if (typeof originalCode === 'string' && POSTGRES_CODES.has(originalCode)) {
    return true;
  }
  return PG_CLIENT_MESSAGE.test(error.message);
}
