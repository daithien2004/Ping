import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { Embedder } from './embedder.port.js';
import { GroqLlmClient } from './groq-llm.client.js';
import type { LlmClient } from './llm-client.port.js';
import { EMBEDDER, LLM_CLIENT, VECTOR_STORE } from './ai.tokens.js';
import { MessageIndexerService } from './indexer/message-indexer.service.js';
import { OnnxEmbedder } from './onnx-embedder.js';
import { QdrantVectorStore } from './qdrant-vector-store.js';
import { RetrievalService } from './retrieval/retrieval.service.js';
import type { VectorStore } from './vector-store.port.js';

export { EMBEDDER, LLM_CLIENT, VECTOR_STORE } from './ai.tokens.js';

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
    {
      provide: VECTOR_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): VectorStore =>
        new QdrantVectorStore(config.get('QDRANT_URL', { infer: true })),
    },
    MessageIndexerService,
    RetrievalService,
  ],
  exports: [EMBEDDER, LLM_CLIENT, VECTOR_STORE, RetrievalService],
})
export class AiModule {}
