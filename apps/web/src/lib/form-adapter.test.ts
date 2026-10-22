import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodFieldErrors, zodFieldNames, zodFormRules } from './form-adapter';

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8),
  displayName: z.string().max(64).optional(),
});

describe('zodFieldNames', () => {
  it('liệt kê field của schema object', () => {
    expect(zodFieldNames(schema).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('trả về mảng rỗng với schema không phải object', () => {
    expect(zodFieldNames(z.string())).toEqual([]);
  });
});

describe('zodFormRules', () => {
  it('tạo luật cho mỗi field', () => {
    const rules = zodFormRules(schema, () => ({}));
    expect(Object.keys(rules).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('validator ném lỗi khi field sai, kèm message của zod', async () => {
    const rules = zodFormRules(schema, () => ({ email: 'khong-phai-email', password: 'short' }));
    const emailRule = rules.email?.[0];
    await expect(emailRule?.validator({}, 'khong-phai-email')).rejects.toThrow();
    const passwordRule = rules.password?.[0];
    await expect(passwordRule?.validator({}, 'short')).rejects.toThrow();
  });

  it('validator pass khi toàn bộ giá trị hợp lệ', async () => {
    const rules = zodFormRules(schema, () => ({ email: 'a@b.co', password: '12345678' }));
    await expect(rules.email?.[0].validator({}, 'a@b.co')).resolves.toBeUndefined();
  });

  it('áp dụng luật ràng buộc giữa các field (refine)', async () => {
    const refine = z
      .object({ password: z.string(), confirm: z.string() })
      .refine((v) => v.password === v.confirm, 'Mật khẩu không khớp');
    const rules = zodFormRules(refine, () => ({ password: 'a', confirm: 'b' }));
    await expect(rules.password?.[0].validator({}, 'a')).rejects.toThrow('Mật khẩu không khớp');
  });
});

describe('zodFieldErrors', () => {
  it('gom lỗi theo field', () => {
    const errors = zodFieldErrors(schema, { email: 'x', password: 'short' });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('trả về rỗng khi dữ liệu hợp lệ', () => {
    expect(zodFieldErrors(schema, { email: 'a@b.co', password: '12345678' })).toEqual({});
  });
});
