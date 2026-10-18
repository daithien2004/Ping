import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UpdateChannelInput } from './schemas.js';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(serverId: string, name: string) {
    // Position nối tiếp dãy hiện có — client không phải tự tính.
    const count = await this.prisma.channel.count({ where: { serverId } });
    return this.prisma.channel.create({ data: { serverId, name, position: count } });
  }

  list(serverId: string) {
    return this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });
  }

  async update(channelId: string, input: UpdateChannelInput) {
    const channel = await this.getChannel(channelId);
    return this.prisma.channel.update({ where: { id: channel.id }, data: input });
  }

  async remove(channelId: string): Promise<{ id: string }> {
    const channel = await this.getChannel(channelId);
    // Cascade khai báo trong schema: xóa channel kéo toàn bộ tin nhắn theo.
    await this.prisma.channel.delete({ where: { id: channel.id } });
    return { id: channelId };
  }

  private async getChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
