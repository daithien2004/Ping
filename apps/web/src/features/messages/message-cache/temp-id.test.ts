import { describe, expect, it } from 'vitest';
import { isTempId, tempIdOf } from './temp-id';

describe('tempIdOf và isTempId', () => {
  it('id dựng từ nonce được nhận ra là tạm', () => {
    expect(isTempId(tempIdOf('n1'))).toBe(true);
  });
  it('id thật của server không phải id tạm', () => {
    expect(isTempId('01900000-0000-7000-8000-000000000001')).toBe(false);
  });
  it('id tạm giữ nguyên nonce để ghép lại với tin thật', () => {
    expect(tempIdOf('n1')).toBe('temp-n1');
  });
});
