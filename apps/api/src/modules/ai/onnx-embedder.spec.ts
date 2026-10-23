import { describe, expect, it } from 'vitest';
import { usesE5Prefix } from './onnx-embedder.js';

describe('usesE5Prefix', () => {
  it('nhận model E5 để thêm tiền tố query/passage', () => {
    expect(usesE5Prefix('Xenova/multilingual-e5-small')).toBe(true);
    expect(usesE5Prefix('intfloat/e5-base')).toBe(true);
    expect(usesE5Prefix('e5-small')).toBe(true);
  });

  it('không thêm tiền tố cho model khác', () => {
    expect(usesE5Prefix('Xenova/all-MiniLM-L6-v2')).toBe(false);
    expect(usesE5Prefix('BAAI/bge-m3')).toBe(false);
    expect(usesE5Prefix('my-e5xperiment')).toBe(false);
  });
});
