import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LIMITS, ROUTE_PREFIX, evaluate, measure } from './bundle-budget.mjs';

const kb = (n) => n * 1024;
const limits = { initialKb: 200, chunkKb: 100, routeKb: 160 };

describe('evaluate', () => {
  it('passes within budget', () => {
    expect(evaluate({ a: kb(50), b: kb(60) }, limits)).toEqual([]);
  });
  it('flags an initial chunk over its limit', () => {
    expect(evaluate({ big: kb(120) }, limits)).toEqual([expect.stringContaining('big')]);
  });
  it('flags the initial total over its limit even when every chunk is small', () => {
    const sizes = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, kb(50)]));
    expect(evaluate(sizes, limits)).toEqual([expect.stringContaining('JS tải ban đầu')]);
  });
  it('keeps on-demand chunks out of the initial total, with their own cap', () => {
    expect(evaluate({ a: kb(50), [`${ROUTE_PREFIX}r`]: kb(150) }, limits)).toEqual([]);
    expect(evaluate({ [`${ROUTE_PREFIX}r`]: kb(170) }, limits)).toEqual([
      expect.stringContaining('tải theo yêu cầu'),
    ]);
  });
  it('ships a budget that matches the plan (450 KB initial, 100 KB per chunk)', () => {
    expect(LIMITS.initialKb).toBe(450);
    expect(LIMITS.chunkKb).toBe(100);
  });
});

describe('measure', () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('counts rootMainFiles/polyfills as initial and other chunks as on-demand', () => {
    dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
    mkdirSync(join(dir, 'static/chunks'), { recursive: true });
    writeFileSync(
      join(dir, 'build-manifest.json'),
      JSON.stringify({
        rootMainFiles: ['static/chunks/root.js'],
        polyfillFiles: ['static/chunks/polyfill.js'],
        lowPriorityFiles: [],
      }),
    );
    writeFileSync(join(dir, 'static/chunks/root.js'), 'root');
    writeFileSync(join(dir, 'static/chunks/polyfill.js'), 'polyfill');
    writeFileSync(join(dir, 'static/chunks/settings.js'), 'settings');
    writeFileSync(join(dir, 'static/chunks/sentry.js'), 'sentry.javascript');

    const sizes = measure(dir);
    expect(sizes[`static/chunks/root.js`]).toBeGreaterThan(0);
    expect(sizes[`static/chunks/polyfill.js`]).toBeGreaterThan(0);
    expect(sizes[`${ROUTE_PREFIX}static/chunks/settings.js`]).toBeGreaterThan(0);
    expect(sizes[`${ROUTE_PREFIX}static/chunks/sentry.js`]).toBeGreaterThan(0);
  });

  it('fails with a clear message when the build output is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
    expect(() => measure(dir)).toThrow(/pnpm build/);
  });
});
