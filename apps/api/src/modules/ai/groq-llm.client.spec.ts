import { describe, expect, it, vi } from 'vitest';
import { AiUnavailableError } from './llm-client.port.js';
import { GroqLlmClient } from './groq-llm.client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GroqLlmClient', () => {
  it('ném AiUnavailableError khi thiếu key, không gọi mạng', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new GroqLlmClient(undefined, 'openai/gpt-oss-20b', fetchImpl);

    await expect(client.complete([{ role: 'user', content: 'xin chào' }])).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gửi đúng model/khoá và đọc nội dung + usage', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        model: 'openai/gpt-oss-20b',
        choices: [{ message: { content: 'Chào bạn.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      }),
    );
    const client = new GroqLlmClient('test-key', 'openai/gpt-oss-20b', fetchImpl);

    const result = await client.complete([{ role: 'user', content: 'xin chào' }]);

    expect(result).toEqual({
      content: 'Chào bạn.',
      model: 'openai/gpt-oss-20b',
      usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
    });
    const [, request] = fetchImpl.mock.calls[0]!;
    expect(request?.headers).toMatchObject({ authorization: 'Bearer test-key' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'xin chào' }],
    });
  });

  it('không đưa body lỗi vào thông báo', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: 'key test-key không hợp lệ' } }, 401),
    );
    const client = new GroqLlmClient('test-key', 'openai/gpt-oss-20b', fetchImpl);

    const error = await client
      .complete([{ role: 'user', content: 'xin chào' }])
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as Error).message).toBe('Groq trả về HTTP 401');
    expect((error as Error).message).not.toContain('test-key');
  });

  it('coi phản hồi không có nội dung là không dùng được', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ choices: [{}] }));
    const client = new GroqLlmClient('test-key', 'openai/gpt-oss-20b', fetchImpl);

    await expect(client.complete([{ role: 'user', content: 'xin chào' }])).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});
