import { describe, expect, it } from 'vitest';
import { createDmSchema, dmAllowSchema, updatePrivacySchema } from './dm';

describe('DM contracts (TG.9, ADR-0070)', () => {
  it('POST /dms nhận userId uuid duy nhất', () => {
    expect(
      createDmSchema.safeParse({ userId: '01990000-0000-7000-8000-000000000001' }).success,
    ).toBe(true);
    expect(createDmSchema.safeParse({ userId: 'khong-phai-uuid' }).success).toBe(false);
    expect(createDmSchema.safeParse({}).success).toBe(false);
  });

  it('dmAllow chỉ nhận hai mức v0.2.0', () => {
    expect(dmAllowSchema.safeParse('server_members').success).toBe(true);
    expect(dmAllowSchema.safeParse('none').success).toBe(true);
    expect(dmAllowSchema.safeParse('all').success).toBe(false); // chờ TG.15
    expect(dmAllowSchema.safeParse('anyone').success).toBe(false);
  });

  it('PATCH riêng tư: chỉ dmAllow, không nhận trường lạ', () => {
    expect(updatePrivacySchema.safeParse({ dmAllow: 'none' }).success).toBe(true);
    expect(updatePrivacySchema.safeParse({}).success).toBe(false);
    expect(updatePrivacySchema.safeParse({ dmAllow: 'all' }).success).toBe(false);
  });
});
