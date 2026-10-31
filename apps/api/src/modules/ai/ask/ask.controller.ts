import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AbilityGuard } from '../../ability/ability.guard.js';
import { CheckAbility } from '../../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { AskRateLimiter } from './ask-rate-limiter.js';
import { AskService, type AskEvent } from './ask.service.js';

const askBodySchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  channelId: z.string().uuid().optional(),
});

type AskBody = z.infer<typeof askBodySchema>;

@Controller('servers/:serverId')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AskController {
  constructor(
    private readonly ask: AskService,
    private readonly rateLimiter: AskRateLimiter,
  ) {}

  @Post('ask')
  @CheckAbility(['view', 'Message'])
  async handleAsk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AskBody,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = askBodySchema.parse(body);
    const serverId = String(response.req.params.serverId);
    await this.ask.authorize({
      userId: user.userId,
      serverId,
      question: parsed.question,
      channelId: parsed.channelId,
    });
    // Sau authorize: người ngoài nhận 403 chứ không bị trừ lượt (và 429 ở đây là JSON thường,
    // chưa mở stream — dialog web đọc mã TOO_MANY_REQUESTS như mọi lỗi khác).
    await this.rateLimiter.consume(user.userId);

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    try {
      for await (const event of this.ask.stream({
        userId: user.userId,
        serverId,
        question: parsed.question,
        channelId: parsed.channelId,
      })) {
        // Client đã hủy (đóng tab/dialog): ngừng ghi, không nối socket đã đóng.
        if (response.destroyed) break;
        response.write(this.format(event));
      }
    } catch (error) {
      if (!response.destroyed) {
        response.write(
          this.format({
            type: 'error',
            data: {
              code: 'AI_ASK_FAILED',
              message: error instanceof Error ? error.message : 'Ask failed',
            },
          }),
        );
      }
    } finally {
      response.end();
    }
  }

  private format(event: AskEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }
}
