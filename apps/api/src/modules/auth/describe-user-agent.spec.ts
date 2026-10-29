import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './describe-user-agent.js';

describe('describeUserAgent (TG.8: tóm tắt User-Agent cho danh sách phiên)', () => {
  it('các UA phổ biến → "trình duyệt trên nền tảng"', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome trên Windows');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      ),
    ).toBe('Edge trên Windows');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe('Safari trên macOS');
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'),
    ).toBe('Firefox trên Linux');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome trên Android');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari trên iOS');
  });

  it('UA không nhận diện được và thiếu UA → nhãn trung tính, không ném', () => {
    expect(describeUserAgent('curl/8.4.0')).toBe('Trình duyệt khác trên nền tảng khác');
    // Chuỗi rỗng coi như thiếu header.
    expect(describeUserAgent('')).toBe('Ứng dụng không rõ');
    expect(describeUserAgent(undefined)).toBe('Ứng dụng không rõ');
    expect(describeUserAgent(null)).toBe('Ứng dụng không rõ');
  });
});
