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
 */
export class GroqLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async complete(
    messages: readonly ChatMessage[],
    options: { maxTokens?: number } = {},
  ): Promise<LlmCompletion> {
    if (!this.apiKey) {
      throw new AiUnavailableError('Thiếu GROQ_API_KEY');
    }

    const response = await this.fetchImpl(GROQ_URL, {
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

    if (!response.ok) {
      // Không đưa body vào lỗi: body có thể chứa chi tiết khoá/đầu vào.
      throw new AiUnavailableError(`Groq trả về HTTP ${response.status}`);
    }

    const body = (await response.json()) as GroqResponse;
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
}
