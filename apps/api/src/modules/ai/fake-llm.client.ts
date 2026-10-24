import type { ChatMessage, LlmClient, LlmCompletion } from './llm-client.port.js';

/** LLM giả lập: câu trả lời cố định, dùng cho test/e2e và môi trường không có AI. */
export class FakeLlmClient implements LlmClient {
  readonly model = 'fake-llm-v1';

  constructor(private readonly reply = 'Trả lời giả lập.') {}

  async complete(messages: readonly ChatMessage[]): Promise<LlmCompletion> {
    // Adapter giả cho test: nếu câu trả lời mặc định không chứa trích dẫn, trích
    // xuất id tin đầu tiên trong <context> và trích dẫn nó để AskService không từ chối.
    // UUID chuẩn (variant 8/9/a/b) — id thật là `uuid(7)` của Prisma.
    let content = this.reply;
    if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(content)) {
      const context = messages.map((message) => message.content).join('\n');
      const match = context.match(
        /<message id="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"/i,
      );
      if (match?.[1]) {
        content = `${content} [${match[1]}]`;
      }
    }
    return {
      content,
      model: this.model,
      usage: {
        promptTokens: messages.reduce((total, message) => total + message.content.length, 0),
        completionTokens: content.length,
        totalTokens:
          messages.reduce((total, message) => total + message.content.length, 0) + content.length,
      },
    };
  }
}
