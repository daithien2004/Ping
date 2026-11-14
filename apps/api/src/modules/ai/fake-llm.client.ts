import type { ChatMessage, LlmClient, LlmCompletion } from './llm-client.port.js';

export class FakeLlmClient implements LlmClient {
  readonly model = 'fake-llm-v1';

  constructor(private readonly reply = 'Trả lời giả lập.') {}

  async complete(messages: readonly ChatMessage[]): Promise<LlmCompletion> {
    // UUID phải đúng variant 8/9/a/b vì id thật là uuid(7).
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
