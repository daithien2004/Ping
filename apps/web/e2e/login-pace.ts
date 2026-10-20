// POST /auth/login tối đa 10 lần/phút/IP (cố ý, chống dò mật khẩu). Bộ e2e chạy nối tiếp trong một
// process nên đếm ở đây được: chờ khi đã dùng đủ 6 lần trong 60 giây (chừa chỗ cho global-setup và
// các spec đăng nhập bằng API).
const WINDOW_MS = 60_000;
const BUDGET = 6;
const recent: number[] = [];

export async function paceLogin() {
  const now = Date.now();
  while (recent.length && now - recent[0]! >= WINDOW_MS) recent.shift();
  if (recent.length >= BUDGET) {
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - recent[0]!)));
    recent.shift();
  }
  recent.push(Date.now());
}
