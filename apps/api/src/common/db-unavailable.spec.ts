import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from './db-unavailable.js';

// Hình dạng lỗi lấy từ thực nghiệm với Prisma 7 + @prisma/adapter-pg 7.10 (xem ADR-0026).
const prismaError = (code: string, meta?: unknown) =>
  Object.assign(new Error('Invalid `prisma.x()` invocation'), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta,
  });
const driverCode = (originalCode: string) => ({
  driverAdapterError: { cause: { originalCode } },
});

describe('isDatabaseUnavailable', () => {
  it('recognizes an unreachable database (Node system code on a Prisma error)', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(isDatabaseUnavailable(prismaError(code))).toBe(true);
    }
  });

  it('recognizes Prisma connectivity and timeout codes', () => {
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024']) {
      expect(isDatabaseUnavailable(prismaError(code))).toBe(true);
    }
  });

  it('recognizes a statement timeout through raw (P2010) and model (P2039) queries', () => {
    expect(isDatabaseUnavailable(prismaError('P2010', driverCode('57014')))).toBe(true);
    expect(isDatabaseUnavailable(prismaError('P2039', driverCode('57014')))).toBe(true);
  });

  it('recognizes server shutdown / too many connections reported by Postgres', () => {
    for (const originalCode of ['57P01', '57P02', '57P03', '53300', '08006']) {
      expect(isDatabaseUnavailable(prismaError('P2010', driverCode(originalCode)))).toBe(true);
    }
  });

  it('recognizes plain pg client errors (query timeout, connect timeout, dropped connection)', () => {
    for (const message of [
      'Query read timeout',
      'timeout exceeded when trying to connect',
      'Connection terminated unexpectedly',
    ]) {
      expect(isDatabaseUnavailable(new Error(message))).toBe(true);
    }
  });

  it('does not treat data errors or unrelated failures as an outage', () => {
    expect(isDatabaseUnavailable(prismaError('P2002'))).toBe(false); // unique constraint
    expect(isDatabaseUnavailable(prismaError('P2025'))).toBe(false); // record not found
    expect(isDatabaseUnavailable(prismaError('P2010', driverCode('23505')))).toBe(false);
    expect(isDatabaseUnavailable(new Error('boom'))).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED')).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
  });
});
