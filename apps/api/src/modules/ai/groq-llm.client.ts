import {
  AiUnavailableError,
  type ChatMessage,
  type LlmClient,
  type LlmCompletion,
} from './llm-client.port.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Adapter Groq (OpenAI-compatible) cho free tier. Không có key thì mọi lời gọi
 * ném `AiUnavailableError` để tầng trên suy giảm thay vì treo.
 *
 * T5.7: mỗi lần thử có timeout riêng; chỉ thử lại khi lỗi tạm thời (429/5xx/lỗi mạng),
 * tối đa `maxRetries` lần. Lỗi 4xx khác (sai khoá, request hỏng) không thử lại.
 */
export class GroqLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
    private readonly maxRetries = 1,
    private readonly retryBackoffMs = 300,
  ) {}

  async complete(
    messages: readonly ChatMessage[],
    options: { maxTokens?: number } = {},
  ): Promise<LlmCompletion> {
    if (!this.apiKey) {
      throw new AiUnavailableError('Thiếu GROQ_API_KEY');
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(this.retryBackoffMs * attempt);

      let response: Response;
      try {
        response = await this.fetchImpl(GROQ_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: options.maxTokens,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        // Lỗi mạng/timeout: có thể thử lại; không đưa chi tiết lỗi vào message trả về.
        continue;
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < this.maxRetries) continue;
        // Không đưa body vào lỗi: body có thể chứa chi tiết khoá/đầu vào.
        throw new AiUnavailableError(`Groq trả về HTTP ${response.status}`);
      }

      let body: GroqResponse;
      try {
        body = (await response.json()) as GroqResponse;
      } catch {
        throw new AiUnavailableError('Groq trả về phản hồi không đọc được');
      }
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new AiUnavailableError('Groq trả về phản hồi rỗng');
      }

      return {
        content,
        model: body.model ?? this.model,
        usage:
          body.usage?.total_tokens === undefined
            ? undefined
            : {
                promptTokens: body.usage.prompt_tokens ?? 0,
                completionTokens: body.usage.completion_tokens ?? 0,
                totalTokens: body.usage.total_tokens,
              },
      };
    }

    throw new AiUnavailableError('Groq không phản hồi sau khi thử lại');
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
