import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AbilityGuard } from '../../ability/ability.guard.js';
import { CheckAbility } from '../../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { AskService, type AskEvent } from './ask.service.js';

const askBodySchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  channelId: z.string().uuid().optional(),
});

type AskBody = z.infer<typeof askBodySchema>;

@Controller('servers/:serverId')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AskController {
  constructor(private readonly ask: AskService) {}

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
        response.write(this.format(event));
      }
    } catch (error) {
      response.write(
        this.format({
          type: 'error',
          data: {
            code: 'AI_ASK_FAILED',
            message: error instanceof Error ? error.message : 'Ask failed',
          },
        }),
      );
    } finally {
      response.end();
    }
  }

  private format(event: AskEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }
}
