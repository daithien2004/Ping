import { isAllowedReactionEmoji } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { SHORTCODE_TO_UNICODE as MARKDOWN_EMOJI } from './map.js';
import { EMOJI_DATA, EMOJI_GROUPS, SKIN_MODIFIERS, SHORTCODE_TO_UNICODE } from './data.js';

describe('emoji dataset (TG.23, ADR-0057)', () => {
  it('đủ lượng và nhóm hợp lệ', () => {
    expect(EMOJI_DATA.length).toBeGreaterThanOrEqual(250);
    for (const entry of EMOJI_DATA) {
      expect(EMOJI_GROUPS).toContain(entry.group);
      expect(entry.keywords.length).toBeGreaterThanOrEqual(1);
      expect(entry.shortcode).toMatch(/^[a-z_]{1,20}$/);
    }
  });

  it('shortcode và unicode không trùng', () => {
    const shortcodes = EMOJI_DATA.map((entry) => entry.shortcode);
    expect(new Set(shortcodes).size).toBe(shortcodes.length);
    const unicodes = EMOJI_DATA.map((entry) => entry.unicode);
    expect(new Set(unicodes).size).toBe(unicodes.length);
  });

  it('SHORTCODE_TO_UNICODE khớp EMOJI_DATA', () => {
    expect(Object.keys(SHORTCODE_TO_UNICODE).length).toBe(EMOJI_DATA.length);
    for (const entry of EMOJI_DATA) {
      expect(SHORTCODE_TO_UNICODE[entry.shortcode]).toBe(entry.unicode);
    }
  });

  it('mọi shortcode của map markdown (TG.4) đều có trong dataset với cùng unicode', () => {
    for (const [shortcode, unicode] of Object.entries(MARKDOWN_EMOJI)) {
      const entry = EMOJI_DATA.find((item) => item.shortcode === shortcode);
      expect(entry).toBeDefined();
      expect(entry!.unicode).toBe(unicode);
    }
  });

  it('tìm "cười" trúng ít nhất các emoji cười phổ biến', () => {
    const matches = (keyword: string) =>
      EMOJI_DATA.filter((entry) => entry.keywords.some((word) => word.includes(keyword))).map(
        (entry) => entry.shortcode,
      );
    for (const shortcode of ['smile', 'joy', 'laughing', 'blush']) {
      expect(matches('cười')).toContain(shortcode);
    }
    // Từ khóa tiếng Anh cũng tìm được.
    expect(matches('fire')).toContain('fire');
  });

  it('tone: true thì unicode kết thúc không phải modifier (modifier ghép lúc chọn)', () => {
    for (const entry of EMOJI_DATA) {
      if (entry.tone) {
        for (const modifier of SKIN_MODIFIERS) {
          expect(entry.unicode.includes(modifier)).toBe(false);
        }
      }
    }
  });

  it('allowlist cảm xúc của @ping/shared phủ đúng dataset picker (TG.2)', () => {
    // API chỉ nhận emoji trong allowlist; lệch một entry là người dùng thấy emoji trong picker
    // nhưng thả xuống bị 400. Test giữ hai nguồn sinh ra từ cùng bộ dữ liệu.
    for (const entry of EMOJI_DATA) {
      expect(isAllowedReactionEmoji(entry.unicode), entry.unicode).toBe(true);
      if (entry.tone) {
        for (const modifier of SKIN_MODIFIERS) {
          expect(isAllowedReactionEmoji(entry.unicode + modifier), entry.shortcode).toBe(true);
        }
      }
    }
    // Văn bản/chuỗi lạ không lọt qua allowlist.
    expect(isAllowedReactionEmoji('ping')).toBe(false);
    expect(isAllowedReactionEmoji('<b>')).toBe(false);
  });
});
