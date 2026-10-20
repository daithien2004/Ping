import type { INestApplication } from '@nestjs/common';
import type { ChannelJoinResult } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

// H7 (docs/perf/2026-10-20-baseline.md, điểm nghẽn 1): presence là best-effort. Lúc nhiều người nối cùng lúc,
// pool Postgres cạn và truy vấn phát presence quá hạn; người dùng ĐÃ xác thực xong không được bị ngắt vì thế.
describe('presence failure on connect (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let token: string;
  let channelId: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    await app.get(RedisProvider).flushdb(); // bộ đếm rate limit của spec khác
    const address = app.getHttpServer().address();
    port = typeof address === 'object' && address !== null ? address.port : 0;

    const suffix = randomUUID().slice(0, 8);
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `pres-${suffix}@ping.dev`,
        username: `pres_${suffix}`,
        password: 'password123',
      })
      .expect(201);
    token = registered.body.accessToken;
    const server = await request(app.getHttpServer())
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Presence resilience' })
      .expect(201);
    const channels = await request(app.getHttpServer())
      .get(`/api/v1/servers/${server.body.id}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    channelId = channels.body[0].id;
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });

  it('keeps the connection (and channel.join works) when the presence query times out', async () => {
    const prisma = app.get(PrismaService);
    // Đúng lỗi quan sát được dưới tải: pool cạn, chờ lấy kết nối quá hạn.
    const failing = vi
      .spyOn(prisma.member, 'findMany')
      .mockRejectedValue(new Error('timeout exceeded when trying to connect'));
    try {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });
      sockets.push(socket);
      const dropped = new Promise<boolean>((resolve) => {
        socket.once('disconnect', () => resolve(true));
        setTimeout(() => resolve(false), 1000);
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });

      // `connect` tới client trước khi handleConnection chạy xong: đợi hết khung 1 giây rồi mới kết luận.
      expect(await dropped).toBe(false);
      expect(failing).toHaveBeenCalled(); // đã thực sự đi qua đường phát presence
      expect(socket.connected).toBe(true);
      const joined = (await socket
        .timeout(3000)
        .emitWithAck('channel.join', { channelId })) as ChannelJoinResult;
      expect(joined).toEqual({ ok: true });
    } finally {
      failing.mockRestore();
    }
  });
});
