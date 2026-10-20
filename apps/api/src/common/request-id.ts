import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const uuid = z.uuid();

/** Chỉ dùng lại X-Request-Id của client khi là UUID: chuỗi tùy ý sẽ đi thẳng vào log và header. */
export function requestIdFrom(header: string | string[] | undefined): string {
  return typeof header === 'string' && uuid.safeParse(header).success ? header : randomUUID();
}

/**
 * Gán `req.id` và header `X-Request-Id` NGAY ĐẦU chuỗi middleware, trước cả body-parser. Lỗi do
 * body-parser (JSON hỏng, body quá lớn) xảy ra trước middleware của pino/CLS, nếu không có bước này
 * thì response lỗi đó không có requestId (ADR-0028). pino-http và CLS dùng lại `req.id` đã có.
 */
export function assignRequestId(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  req.id = requestIdFrom(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.id);
  next();
}
