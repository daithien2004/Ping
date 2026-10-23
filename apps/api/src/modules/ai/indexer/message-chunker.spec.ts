import { describe, expect, it } from 'vitest';
import { buildConversationChunk, estimateTokens, type ChunkMessage } from './message-chunker.js';

const messages: ChunkMessage[] = [
  { id: 'm1', author: 'An', content: 'một đoạn cũ' },
  { id: 'm2', author: 'Bình', content: 'một đoạn giữa' },
  { id: 'm3', author: 'Chi', content: 'tin mới nhất' },
];

describe('message chunker', () => {
  it('luôn giữ tin neo và lấy thêm tin liền trước trong giới hạn token', () => {
    const chunk = buildConversationChunk(messages, estimateTokens('Chi: tin mới nhất') + 5);

    expect(chunk.messageIds.at(-1)).toBe('m3');
    expect(chunk.text).toContain('Chi: tin mới nhất');
    expect(chunk.messageIds.length).toBeLessThan(3);
  });

  it('giữ đủ tin khi ngân sách token rộng, theo đúng thứ tự thời gian', () => {
    const chunk = buildConversationChunk(messages, 10_000);

    expect(chunk.messageIds).toEqual(['m1', 'm2', 'm3']);
    expect(chunk.text).toBe('An: một đoạn cũ\nBình: một đoạn giữa\nChi: tin mới nhất');
  });

  it('vẫn giữ tin neo dù một mình nó vượt trần token', () => {
    const chunk = buildConversationChunk([messages[2]!], 1);

    expect(chunk.messageIds).toEqual(['m3']);
    expect(chunk.text).toBe('Chi: tin mới nhất');
  });

  it('trả chunk rỗng khi không có tin', () => {
    expect(buildConversationChunk([], 100)).toEqual({ text: '', messageIds: [] });
  });
});
