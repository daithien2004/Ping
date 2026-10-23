import { describe, expect, it } from 'vitest';
import { collectionName, embeddingVersion } from './vector-schema.js';

describe('vector schema', () => {
  it('tạo tên collection an toàn, tách theo model + số chiều + phiên bản', () => {
    expect(collectionName('Xenova/multilingual-e5-small', 384)).toBe(
      'messages__xenova_multilingual_e5_small__384__v1',
    );
    expect(collectionName('Xenova/all-MiniLM-L6-v2', 384)).not.toBe(
      collectionName('Xenova/multilingual-e5-small', 384),
    );
    expect(collectionName('Xenova/multilingual-e5-small', 768)).not.toBe(
      collectionName('Xenova/multilingual-e5-small', 384),
    );
  });

  it('tên collection chỉ gồm chữ, số và gạch dưới', () => {
    expect(collectionName('a/b.c d?', 3)).toMatch(/^[a-z0-9_]+$/);
  });

  it('modelVersion chứa model, số chiều và schema', () => {
    expect(embeddingVersion('Xenova/multilingual-e5-small', 384)).toBe(
      'Xenova/multilingual-e5-small:384:schema1',
    );
  });
});
