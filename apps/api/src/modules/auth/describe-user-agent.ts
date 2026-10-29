/**
 * Tóm tắt User-Agent thành nhãn thiết bị ngắn gọn cho danh sách phiên (TG.8) —
 * hàm thuần, không phụ thuộc thư viện: chỉ cần vài cặp hay gặp, sai sót hiển thị
 * không ảnh hưởng bảo mật. Thứ tự kiểm tra quan trọng (UA chứa tên trình duyệt khác):
 * Edge/Opera có chữ "Chrome", Chrome có chữ "Safari", Android có chữ "Linux",
 * iPhone có chữ "Mac" — nhánh đặc trưng hơn phải đứng trước.
 */
export function describeUserAgent(ua: string | undefined | null): string {
  if (!ua) {
    return 'Ứng dụng không rõ';
  }
  const browser = browserOf(ua) ?? 'Trình duyệt khác';
  const platform = platformOf(ua) ?? 'nền tảng khác';
  return `${browser} trên ${platform}`;
}

const BROWSERS: Array<[token: string, name: string]> = [
  ['Edg/', 'Edge'],
  ['OPR/', 'Opera'],
  ['SamsungBrowser/', 'Samsung Internet'],
  ['Firefox/', 'Firefox'],
  ['Chrome/', 'Chrome'],
  ['Safari/', 'Safari'],
];

const PLATFORMS: Array<[pattern: RegExp, name: string]> = [
  [/Windows/i, 'Windows'],
  [/Android/i, 'Android'],
  [/iPhone|iPad|iPod/i, 'iOS'],
  [/Mac OS X/i, 'macOS'],
  [/Linux|X11/i, 'Linux'],
];

function browserOf(ua: string): string | undefined {
  return BROWSERS.find(([token]) => ua.includes(token))?.[1];
}

function platformOf(ua: string): string | undefined {
  return PLATFORMS.find(([pattern]) => pattern.test(ua))?.[1];
}
