import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts applies the prefix, but main.ts never runs inside a test —
    // the e2e harness must reproduce it or every path would be off.
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200 (liveness, works without touching the database)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /api/v1/ready → 200 with database and redis both up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.details.database.status).toBe('up');
    expect(res.body.details.redis.status).toBe('up');
  });

  it('X-Request-Id: giữ UUID hợp lệ của client, thay chuỗi rác bằng UUID mới', async () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const own = '4b1c9a70-5f0e-4c1a-9b0a-2f1d3c4e5a6b';
    const kept = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', own)
      .expect(200);
    expect(kept.headers['x-request-id']).toBe(own);

    const replaced = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'x'.repeat(5000))
      .expect(200);
    expect(replaced.headers['x-request-id']).toMatch(uuidPattern);
  });
});
