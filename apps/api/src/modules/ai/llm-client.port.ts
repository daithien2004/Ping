/** Cổng gọi LLM. Logic AI chỉ phụ thuộc interface này, không gắn cứng Groq (ADR-0046). */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCompletion {
  content: string;
  model: string;
  usage?: LlmUsage;
}

export interface LlmClient {
  readonly model: string;
  complete(
    messages: readonly ChatMessage[],
    options?: { maxTokens?: number },
  ): Promise<LlmCompletion>;
}

/** AI chưa cấu hình hoặc provider không dùng được: tầng gọi phải suy giảm, không chặn chat. */
export class AiUnavailableError extends Error {
  constructor(message = 'AI chưa được cấu hình') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
