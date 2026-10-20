import { describe, expect, it } from 'vitest';
import { evaluate } from './bundle-budget.mjs';

const kb = (n) => n * 1024;

describe('evaluate', () => {
  it('passes within budget', () => {
    expect(evaluate({ a: kb(50), b: kb(60) }, { totalKb: 200, chunkKb: 100 })).toEqual([]);
  });
  it('flags a chunk over its limit', () => {
    expect(evaluate({ big: kb(120) }, { totalKb: 500, chunkKb: 100 })).toEqual([
      expect.stringContaining('big'),
    ]);
  });
  it('flags a total over its limit even when every chunk is small', () => {
    const sizes = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, kb(50)]));
    expect(evaluate(sizes, { totalKb: 200, chunkKb: 100 })).toEqual([
      expect.stringContaining('tổng'),
    ]);
  });
  it('keeps lazy chunks out of the initial total, with their own cap', () => {
    const limits = { totalKb: 100, chunkKb: 100, lazyKb: 160 };
    expect(evaluate({ a: kb(50), 'lazy:s': kb(150) }, limits)).toEqual([]);
    expect(evaluate({ 'lazy:s': kb(170) }, limits)).toEqual([expect.stringContaining('lazy')]);
  });
});
