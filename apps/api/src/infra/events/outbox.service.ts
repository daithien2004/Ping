import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId?: string;
  type: string;
  payload: unknown;
}

/** Ghi outbox trong cùng transaction với thay đổi dữ liệu (T1.3). */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async write(tx: Prisma.TransactionClient, event: OutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        type: event.type,
        payload: event.payload as object,
      },
    });
  }
}
