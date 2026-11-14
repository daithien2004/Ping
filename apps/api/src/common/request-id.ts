import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const uuid = z.uuid();

// Chỉ dùng lại X-Request-Id của client khi là UUID: chuỗi tùy ý đi thẳng vào log và header.
export function requestIdFrom(header: string | string[] | undefined): string {
  return typeof header === 'string' && uuid.safeParse(header).success ? header : randomUUID();
}

// Đặt ngay đầu chuỗi middleware, trước body-parser: lỗi body-parser xảy ra trước pino/CLS nên cần req.id sớm.
export function assignRequestId(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  req.id = requestIdFrom(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.id);
  next();
}
