import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import type { CreateRoleInput, UpdateRoleInput } from './schemas.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  create(serverId: string, input: CreateRoleInput) {
    return this.prisma.role.create({
      data: {
        serverId,
        name: input.name,
        permissions: input.permissions ?? 0n,
        position: input.position ?? 0,
      },
    });
  }

  list(serverId: string) {
    return this.prisma.role.findMany({
      where: { serverId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async update(roleId: string, input: UpdateRoleInput) {
    const role = await this.getRole(roleId);
    // @everyone sửa quyền được (Discord cũng vậy) — chỉ cấm XÓA.
    const updated = await this.prisma.role.update({ where: { id: role.id }, data: input });
    // Quyền của mọi member có role này đổi → cache ability của cả server phải chết.
    await this.abilityFactory.invalidateServer(role.serverId);
    return updated;
  }

  async remove(roleId: string): Promise<{ id: string }> {
    const role = await this.getRole(roleId);
    if (role.isDefault) {
      throw new BadRequestException('The @everyone role cannot be deleted');
    }
    await this.prisma.role.delete({ where: { id: role.id } });
    await this.abilityFactory.invalidateServer(role.serverId);
    return { id: roleId };
  }

  async assign(serverId: string, memberId: string, roleIds: string[]) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.serverId !== serverId) {
      throw new NotFoundException('Member not found in this server');
    }

    const roles = await this.prisma.role.findMany({
      where: { serverId, id: { in: roleIds } },
      select: { id: true, isDefault: true },
    });
    if (roles.length !== new Set(roleIds).size) {
      throw new BadRequestException('Every role must belong to this server');
    }

    // @everyone luôn gắn sẵn cho mọi member — không gán (và không cần lưu) thủ công.
    const assignable = roles.filter((role) => !role.isDefault).map((role) => role.id);

    await this.prisma.$transaction([
      this.prisma.memberRole.deleteMany({ where: { memberId } }),
      this.prisma.memberRole.createMany({
        data: assignable.map((roleId) => ({ memberId, roleId })),
      }),
    ]);

    // Quyền hiệu lực của member vừa đổi — cache Redis cũ không được phép nói dối.
    await this.abilityFactory.invalidateServer(serverId);

    return this.prisma.member.findUnique({
      where: { id: memberId },
      include: {
        roles: { select: { role: { select: { id: true, name: true, permissions: true } } } },
      },
    });
  }

  private async getRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }
}
