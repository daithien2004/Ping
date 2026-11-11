import { describe, expect, it } from 'vitest';
import { dmAbilityFor } from './dm-ability';

const me = '01990000-0000-7000-8000-000000000001';

describe('dmAbilityFor', () => {
  it('không bị chặn: gửi và đọc tin đều được', () => {
    const ability = dmAbilityFor(me, false);
    expect(ability.can('create', 'Message')).toBe(true);
    expect(ability.can('view', 'Message')).toBe(true);
  });

  it('bị chặn: không gửi được nữa nhưng vẫn đọc được tin cũ', () => {
    const ability = dmAbilityFor(me, true);
    expect(ability.can('create', 'Message')).toBe(false);
    expect(ability.can('view', 'Message')).toBe(true);
  });

  it('chỉ rút đúng rule tạo tin, các rule khác giữ nguyên', () => {
    const truoc = dmAbilityFor(me, false).rules.length;
    const sau = dmAbilityFor(me, true).rules.length;
    expect(sau).toBe(truoc - 1);
  });
});
