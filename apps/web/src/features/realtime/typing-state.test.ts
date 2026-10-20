import { describe, expect, it } from 'vitest';
import { addTyping, expireTyping, TYPING_TTL_MS } from './typing-state';

describe('typing leases', () => {
  it('refreshes one user without duplicates and expires only elapsed leases', () => {
    let state = addTyping({}, 'c1', 'u1', 100);
    state = addTyping(state, 'c1', 'u1', 200);
    state = addTyping(state, 'c2', 'u2', 300);
    expect(Object.keys(state.c1 ?? {})).toEqual(['u1']);
    expect(expireTyping(state, 200 + TYPING_TTL_MS)).toEqual({ c2: { u2: 300 + TYPING_TTL_MS } });
    expect(expireTyping(state, 300 + TYPING_TTL_MS)).toEqual({});
  });
});
