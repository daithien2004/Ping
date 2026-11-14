import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp } from './helpers/boot.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

describe('HTTP hardening (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects a JSON body over 32 KB with 413 and the uniform error shape (messages are <= 4000 chars)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'a@ping.dev', password: 'x'.repeat(40_000) });
    expect(res.status).toBe(413);
    expect(res.body.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('PayloadTooLargeError');
  });

  it('rejects malformed JSON with 400 (not 500) and no parser details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('still accepts a normal body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@ping.dev', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('sends security headers (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: only the web origin is allowed, with credentials', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/auth/refresh')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-ping-client');
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const actual = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', WEB_ORIGIN);
    const exposed = actual.headers['access-control-expose-headers'] ?? '';
    expect(exposed).toContain('Retry-After');
    expect(exposed).toContain('X-RateLimit-Remaining');
    expect(exposed).toContain('X-RateLimit-Reset');

    const foreign = await request(app.getHttpServer())
      .options('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
