import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { UsersService } from './users.service.js';

const ME = '00000000-0000-0000-0000-000000000001';

/** Prisma giả đúng những gì cài đặt (TG.13) đụng tới; upsert mô phỏng ngữ nghĩa thật của DB:
 * đã có hàng thì merge `update` lên hàng cũ, chưa có thì trả `create` (một trong hai nhánh,
 * không merge chéo — merge chéo sẽ giấu được bug "update mang nhầm trường"). */
function makePrisma(existing: Record<string, unknown> | null = null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ dmAllow: 'server_members' }),
    },
    userSettings: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert: vi
        .fn()
        .mockImplementation(
          (args: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
            Promise.resolve(existing ? { ...existing, ...args.update } : { ...args.create }),
        ),
    },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

/** attachments/realtime không nằm trên đường cài đặt — stub rỗng đủ cho constructor. */
function makeService(prisma: PrismaService) {
  return new UsersService(prisma, {} as AttachmentsService, {} as RealtimeService);
}

describe('UsersService.getSettings (TG.13 — lazy default)', () => {
  it('chưa có hàng → trả DTO mặc định, KHÔNG tạo hàng (chỉ PATCH mới ghi)', async () => {
    const prisma = makePrisma(null);
    const service = makeService(prisma);
    await expect(service.getSettings(ME)).resolves.toEqual({
      theme: 'system',
      density: 'comfortable',
      fontSize: 'md',
      locale: 'vi',
    });
    expect(prisma.userSettings.findUnique).toHaveBeenCalledWith({ where: { userId: ME } });
    expect(prisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('có hàng → map row → DTO theo giá trị đã lưu', async () => {
    const prisma = makePrisma({
      userId: ME,
      theme: 'dark',
      density: 'compact',
      fontSize: 'lg',
      locale: 'en',
    });
    await expect(makeService(prisma).getSettings(ME)).resolves.toEqual({
      theme: 'dark',
      density: 'compact',
      fontSize: 'lg',
      locale: 'en',
    });
  });
});

describe('UsersService.getPrivacy (TG.13 — đọc mức riêng tư đã lưu)', () => {
  it('trả dmAllow của chính người gọi, chỉ select cột cần', async () => {
    const prisma = makePrisma();
    await expect(makeService(prisma).getPrivacy(ME)).resolves.toEqual({
      dmAllow: 'server_members',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: ME },
      select: { dmAllow: true },
    });
  });

  it('không có user (JWT trỏ tới hàng đã xóa) → NotFound, không trả DTO rỗng', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(makeService(prisma).getPrivacy(ME)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.updateSettings (upsert, PATCH semantics)', () => {
  it('PATCH một trường khi chưa có hàng: create điền MẶC ĐỊNH cho trường không gửi', async () => {
    const prisma = makePrisma(null);
    const dto = await makeService(prisma).updateSettings(ME, { theme: 'dark' });
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: ME },
      create: {
        userId: ME,
        theme: 'dark',
        density: 'comfortable',
        fontSize: 'md',
        locale: 'vi',
      },
      update: { theme: 'dark' },
    });
    expect(dto).toEqual({ theme: 'dark', density: 'comfortable', fontSize: 'md', locale: 'vi' });
  });

  it('PATCH một trường khi đã có hàng: update chỉ mang trường gửi — trường cũ giữ nguyên', async () => {
    const prisma = makePrisma({
      userId: ME,
      theme: 'light',
      density: 'compact',
      fontSize: 'lg',
      locale: 'en',
    });
    const dto = await makeService(prisma).updateSettings(ME, { theme: 'dark' });
    const call = prisma.userSettings.upsert.mock.calls[0]![0] as { update: object };
    // Đúng các khóa này, không hơn: trường không gửi không được xuất hiện trong `update`.
    expect(call.update).toEqual({ theme: 'dark' });
    // Fake merge của DB: các trường không gửi vẫn giá trị cũ.
    expect(dto).toEqual({ theme: 'dark', density: 'compact', fontSize: 'lg', locale: 'en' });
  });

  it('PATCH hai trường: update chứa đúng hai trường đó', async () => {
    const prisma = makePrisma({
      userId: ME,
      theme: 'dark',
      density: 'compact',
      fontSize: 'md',
      locale: 'vi',
    });
    await makeService(prisma).updateSettings(ME, { locale: 'en', fontSize: 'sm' });
    const call = prisma.userSettings.upsert.mock.calls[0]![0] as { update: object };
    expect(call.update).toEqual({ locale: 'en', fontSize: 'sm' });
  });
});
