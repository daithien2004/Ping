import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ShutdownService } from '../src/infra/lifecycle/shutdown.service.js';
import { bootApp } from './helpers/boot.js';

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

  it('GET /api/v1/ready → 200 "degraded" while only Redis is down (REST still works)', async () => {
    const degraded = await bootApp({ deadRedis: true });
    try {
      const res = await request(degraded.getHttpServer()).get('/api/v1/ready').expect(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.details.database.status).toBe('up');
      expect(res.body.details.redis.status).toBe('down');
    } finally {
      await degraded.close();
    }
  });

  it('GET /api/v1/ready → 503 once the instance is draining (SIGTERM received)', async () => {
    const draining = await bootApp();
    try {
      draining.get(ShutdownService).beginDrain();
      const res = await request(draining.getHttpServer()).get('/api/v1/ready').expect(503);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
      // Liveness không đổi: process vẫn sống để xử lý nốt request đang chạy.
      await request(draining.getHttpServer()).get('/api/v1/health').expect(200);
    } finally {
      await draining.close();
    }
  });
});
