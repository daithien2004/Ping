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

export class AiUnavailableError extends Error {
  constructor(message = 'AI chưa được cấu hình') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
