// Thứ tự kiểm tra quan trọng, nhánh đặc trưng đứng trước: Edge/Opera chứa "Chrome", Chrome chứa "Safari",
// Android chứa "Linux", iPhone chứa "Mac".
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
