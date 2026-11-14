// Lỗi dữ liệu (P2002, P2025…) KHÔNG thuộc nhóm này. Dạng lỗi theo thực nghiệm Prisma 7 + adapter-pg 7.10:
// không với tới DB: code là mã hệ thống; statement_timeout: P2010/P2039, mã Postgres ở meta.driverAdapterError.cause.originalCode ('57014'); query_timeout/hết pool: Error thường của pg.
const SYSTEM_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
const PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
// 57014 query_canceled, 57P01..03 server tắt/khởi động lại, 53300 too_many_connections, 08xxx lỗi kết nối.
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
