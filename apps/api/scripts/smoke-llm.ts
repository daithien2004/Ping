/**
 * Smoke call thủ công cho adapter Groq (T5.1). Không chạy trong test tự động và
 * không in khoá. Cần GROQ_API_KEY trong .env ở gốc repo.
 *
 *   pnpm --filter api exec tsx scripts/smoke-llm.ts
 */
import { config } from 'dotenv';
import { GroqLlmClient } from '../src/modules/ai/groq-llm.client.js';

config({ path: '../../.env', quiet: true });

const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b';
const client = new GroqLlmClient(process.env.GROQ_API_KEY, model);
const started = performance.now();

const result = await client.complete(
  [
    { role: 'system', content: 'Trả lời ngắn gọn bằng tiếng Việt.' },
    { role: 'user', content: 'Ping là gì? Trả lời trong một câu.' },
  ],
  { maxTokens: 256 },
);

console.log(
  JSON.stringify(
    {
      model: result.model,
      latencyMs: Math.round(performance.now() - started),
      usage: result.usage,
      contentLength: result.content.length,
      content: result.content,
    },
    null,
    2,
  ),
);
