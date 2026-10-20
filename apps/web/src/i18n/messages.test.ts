import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { localeFromCookie } from './config';

/** Mọi đường dẫn key lá, ví dụ "auth.email", "common.languages.vi". */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('messages', () => {
  it('en.json has exactly the keys of vi.json', () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort());
  });

  it('no empty translation', () => {
    const empty = (tree: object) =>
      keys(tree).filter((path) => {
        const value = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], tree);
        return value === '';
      });
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});

describe('localeFromCookie', () => {
  it('reads the locale cookie among others', () => {
    expect(localeFromCookie('a=1; locale=en; b=2')).toBe('en');
  });

  it('falls back to vi when missing or unknown', () => {
    expect(localeFromCookie('')).toBe('vi');
    expect(localeFromCookie('locale=fr')).toBe('vi');
    expect(localeFromCookie('xlocale=en')).toBe('vi');
  });
});
