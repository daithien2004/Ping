import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitByIp } from '../decorators.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { HttpThrottlerGuard } from './http-throttler.guard.js';

/**
 * ADR-0080: tracker của guard là danh tính người gọi khi access token HỢP LỆ, ngược lại là IP.
 * Điểm bảo mật quan trọng nhất là nhánh "ngược lại": token bịa/hết hạn phải rơi về IP, không được
 * đọc payload chưa verify để tạo bucket mới cho mỗi request.
 */
const OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
};

function request(authorization?: string): Request {
  return { ip: '127.0.0.1', headers: authorization ? { authorization } : {} } as unknown as Request;
}

function contextOf(handler: () => void, controller: new () => unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

class PlainController {
  handler(): void {}
}

@RateLimitByIp()
class IpKeyedController {
  handler(): void {}
}

class ExposedGuard extends HttpThrottlerGuard {
  tracker(req: Request, context: ExecutionContext): Promise<string> {
    return this.getTracker(req, context);
  }
}

function setup(verifyAsync: (token: string) => Promise<unknown>) {
  const jwt = { verifyAsync: vi.fn(verifyAsync) } as unknown as JwtService;
  const guard = new ExposedGuard(
    OPTIONS,
    { increment: vi.fn() } as unknown as ThrottlerStorage,
    new Reflector(),
    { isUp: true } as unknown as RedisProvider,
    jwt,
  );
  return { guard, jwt };
}

const plainContext = (): ExecutionContext =>
  contextOf(PlainController.prototype.handler, PlainController);

describe('HttpThrottlerGuard.getTracker (ADR-0080)', () => {
  it('keys by the verified user when the access token is valid', async () => {
    const { guard, jwt } = setup(async () => ({ sub: 'user-1' }));

    await expect(guard.tracker(request('Bearer good-token'), plainContext())).resolves.toBe(
      'user:user-1',
    );
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good-token');
  });

  it('falls back to the IP for a forged or expired token (never trusts an unverified payload)', async () => {
    const { guard } = setup(async () => {
      throw new Error('invalid signature');
    });

    await expect(guard.tracker(request('Bearer forged-token'), plainContext())).resolves.toBe(
      '127.0.0.1',
    );
  });

  it('falls back to the IP when the token has no usable sub', async () => {
    const { guard } = setup(async () => ({ username: 'no-sub' }));
    await expect(guard.tracker(request('Bearer token'), plainContext())).resolves.toBe('127.0.0.1');

    const { guard: emptySub } = setup(async () => ({ sub: '' }));
    await expect(emptySub.tracker(request('Bearer token'), plainContext())).resolves.toBe(
      '127.0.0.1',
    );
  });

  it('falls back to the IP when the authorization header is missing or not a Bearer token', async () => {
    const { guard, jwt } = setup(async () => ({ sub: 'user-1' }));

    await expect(guard.tracker(request(), plainContext())).resolves.toBe('127.0.0.1');
    await expect(guard.tracker(request('Bearer '), plainContext())).resolves.toBe('127.0.0.1');
    await expect(guard.tracker(request('Basic abc'), plainContext())).resolves.toBe('127.0.0.1');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('never throws, even when the verifier rejects with a non-Error value', async () => {
    const { guard } = setup(() => Promise.reject(undefined));
    await expect(guard.tracker(request('Bearer token'), plainContext())).resolves.toBe('127.0.0.1');
  });

  it('ignores an authenticated identity on @RateLimitByIp buckets (attachments, /auth/*)', async () => {
    const { guard } = setup(async () => ({ sub: 'user-1' }));
    const context = contextOf(IpKeyedController.prototype.handler, IpKeyedController);

    await expect(guard.tracker(request('Bearer token'), context)).resolves.toBe('127.0.0.1');
  });
});
