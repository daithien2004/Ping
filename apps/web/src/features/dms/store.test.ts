import { beforeEach, describe, expect, it } from 'vitest';
import { selectDmBlocked, useDmBlockStore } from './store';

const state = () => useDmBlockStore.getState();

beforeEach(() => useDmBlockStore.setState({ blocked: {} }));

describe('useDmBlockStore', () => {
  it('ghi nhận rồi gỡ ghi nhận chặn theo từng partner', () => {
    state().setBlocked('u1', true);
    expect(selectDmBlocked('u1')(state())).toBe(true);
    expect(selectDmBlocked('u2')(state())).toBe(false);

    state().setBlocked('u1', false);
    expect(selectDmBlocked('u1')(state())).toBe(false);
  });

  it('đặt lại cùng giá trị thì giữ nguyên object, không làm render lại thừa', () => {
    state().setBlocked('u1', true);
    const truoc = state().blocked;
    state().setBlocked('u1', true);
    expect(state().blocked).toBe(truoc);

    state().setBlocked('u2', false);
    expect(state().blocked).toBe(truoc);
  });
});
