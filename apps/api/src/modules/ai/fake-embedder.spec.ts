import { describe, expect, it } from 'vitest';
import { FakeEmbedder } from './fake-embedder.js';

describe('FakeEmbedder', () => {
  it('trả đúng số chiều và vector đã chuẩn hoá', async () => {
    const embedder = new FakeEmbedder(16);
    const batch = await embedder.embed(['xin chào', 'tạm biệt'], 'passage');

    expect(batch.model).toBe('fake-embedding-v1');
    expect(batch.dimensions).toBe(16);
    expect(batch.vectors).toHaveLength(2);
    for (const vector of batch.vectors) {
      expect(vector).toHaveLength(16);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
    }
  });

  it('tất định theo role và nội dung', async () => {
    const embedder = new FakeEmbedder(8);
    const first = await embedder.embed(['một tin nhắn'], 'query');
    const second = await embedder.embed(['một tin nhắn'], 'query');
    const passage = await embedder.embed(['một tin nhắn'], 'passage');

    expect(first.vectors).toEqual(second.vectors);
    expect(first.vectors).not.toEqual(passage.vectors);
  });

  it('không gọi model khi danh sách rỗng', async () => {
    const embedder = new FakeEmbedder();
    const batch = await embedder.embed([], 'query');

    expect(batch.vectors).toEqual([]);
  });
});
