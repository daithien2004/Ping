import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { Embedder } from './embedder.port.js';
import { GroqLlmClient } from './groq-llm.client.js';
import type { LlmClient } from './llm-client.port.js';
import { OnnxEmbedder } from './onnx-embedder.js';

export const EMBEDDER = Symbol('EMBEDDER');
export const LLM_CLIENT = Symbol('LLM_CLIENT');

/**
 * Điểm nối duy nhất cho AI (ADR-0046). Port được export để module khác inject;
 * adapter thật chỉ tải model/gọi mạng khi có lời gọi đầu tiên.
 */
@Module({
  providers: [
    {
      provide: EMBEDDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Embedder =>
        new OnnxEmbedder(config.get('EMBEDDING_MODEL', { infer: true })),
    },
    {
      provide: LLM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmClient =>
        new GroqLlmClient(
          config.get('GROQ_API_KEY', { infer: true }),
          config.get('GROQ_MODEL', { infer: true }),
        ),
    },
  ],
  exports: [EMBEDDER, LLM_CLIENT],
})
export class AiModule {}
