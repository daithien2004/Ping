import type { ChatMessage, LlmClient, LlmCompletion } from './llm-client.port.js';

/** LLM giả lập: câu trả lời cố định, dùng cho test/e2e và môi trường không có AI. */
export class FakeLlmClient implements LlmClient {
  readonly model = 'fake-llm-v1';

  constructor(private readonly reply = 'Trả lời giả lập.') {}

  async complete(messages: readonly ChatMessage[]): Promise<LlmCompletion> {
    return {
      content: this.reply,
      model: this.model,
      usage: {
        promptTokens: messages.reduce((total, message) => total + message.content.length, 0),
        completionTokens: this.reply.length,
        totalTokens:
          messages.reduce((total, message) => total + message.content.length, 0) +
          this.reply.length,
      },
    };
  }
}
