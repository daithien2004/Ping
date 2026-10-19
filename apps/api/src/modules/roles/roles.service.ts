import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canManageMember, canManagePermissions } from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import type { CreateRoleInput, UpdateRoleInput } from './schemas.js';

/**
 * Guard chỉ đảm bảo người gọi có MANAGE_ROLES. Service kiểm tra thêm ĐỐI TƯỢNG:
 * không ai cấp, sửa, xóa hay gán được quyền mạnh hơn quyền của chính mình (ADR-0004).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async create(serverId: string, actorId: string, input: CreateRoleInput) {
    const permissions = input.permissions ?? 0n;
    await this.assertCanManage(serverId, actorId, permissions);
    return this.prisma.role.create({
      data: { serverId, name: input.name, permissions, position: input.position ?? 0 },
    });
  }

  list(serverId: string) {
    return this.prisma.role.findMany({
      where: { serverId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async update(roleId: string, actorId: string, input: UpdateRoleInput) {
    const role = await this.getRole(roleId);
    // Cả quyền hiện có lẫn quyền mới đều phải nằm trong quyền của người sửa.
    await this.assertCanManage(
      role.serverId,
      actorId,
      role.permissions | (input.permissions ?? 0n),
    );
    // @everyone sửa quyền được (Discord cũng vậy) — chỉ cấm XÓA.
    const updated = await this.prisma.role.update({ where: { id: role.id }, data: input });
    // Quyền của mọi member có role này đổi → cache ability của cả server phải chết.
    await this.abilityFactory.invalidateServer(role.serverId);
    return updated;
  }

  async remove(roleId: string, actorId: string): Promise<{ id: string }> {
    const role = await this.getRole(roleId);
    if (role.isDefault) {
      throw new BadRequestException('The @everyone role cannot be deleted');
    }
    await this.assertCanManage(role.serverId, actorId, role.permissions);
    await this.prisma.role.delete({ where: { id: role.id } });
    await this.abilityFactory.invalidateServer(role.serverId);
    return { id: roleId };
  }

  async assign(serverId: string, actorId: string, memberId: string, roleIds: string[]) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.serverId !== serverId) {
      throw new NotFoundException('Member not found in this server');
    }

    const roles = await this.prisma.role.findMany({
      where: { serverId, id: { in: roleIds } },
      select: { id: true, isDefault: true, permissions: true },
    });
    if (roles.length !== new Set(roleIds).size) {
      throw new BadRequestException('Every role must belong to this server');
    }

    // Không đổi role của người mạnh hơn mình (gỡ role của họ cũng là "đụng" quyền đó),
    // và không gán role mạnh hơn mình (kể cả cho chính mình).
    const actor = await this.abilityFactory.contextFor(serverId, actorId);
    const target = await this.abilityFactory.contextFor(serverId, member.userId);
    const granted = roles.reduce((acc, role) => acc | role.permissions, 0n);
    if (!canManageMember(actor, target) || !canManagePermissions(actor, granted)) {
      throw new ForbiddenException('You cannot manage roles above your own permissions');
    }

    // @everyone luôn gắn với mọi member: chỉ thay các role còn lại, giữ nguyên dòng @everyone.
    const assignable = roles.filter((role) => !role.isDefault).map((role) => role.id);
    await this.prisma.$transaction([
      this.prisma.memberRole.deleteMany({ where: { memberId, role: { isDefault: false } } }),
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

  private async assertCanManage(serverId: string, actorId: string, permissions: bigint) {
    const actor = await this.abilityFactory.contextFor(serverId, actorId);
    if (!canManagePermissions(actor, permissions)) {
      throw new ForbiddenException('You cannot manage roles above your own permissions');
    }
  }

  private async getRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }
}
