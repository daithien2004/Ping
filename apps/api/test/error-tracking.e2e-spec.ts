import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { captureServerError } from '../src/infra/sentry/sentry.js';
import { ServersService } from '../src/modules/servers/servers.service.js';

vi.mock('../src/infra/sentry/sentry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/infra/sentry/sentry.js')>()),
  captureServerError: vi.fn(),
}));

// H5 (ADR-0031): một lỗi 500 bất ngờ có CÙNG requestId ở response body, header X-Request-Id và lỗi
// gửi lên Sentry — chính là sợi dây để từ mã lỗi trên giao diện tra ra log và lỗi trên Sentry.
describe('error tracking (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ServersService)
      .useValue({
        listForUser: () => {
          throw new Error('boom: bug cố ý');
        },
      })
      .compile();
    const nest = module.createNestApplication<NestExpressApplication>();
    configureApp(nest);
    await nest.init();
    app = nest;
  });
  afterAll(() => app.close());

  it('a 500 carries one requestId in body, header and the Sentry report', async () => {
    const suffix = randomUUID().slice(0, 8);
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `trk-${suffix}@ping.dev`,
        username: `trk_${suffix}`,
        password: 'password123',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/servers')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(500);

    const requestId = res.body.requestId as string;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(requestId);
    expect(captureServerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom: bug cố ý' }),
      {
        requestId,
        userId: registered.body.user.id,
      },
    );
  });
});
