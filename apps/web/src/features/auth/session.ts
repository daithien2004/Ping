/**
 * Chỉ chấp nhận đường dẫn nội bộ cho `?next=` (chống open redirect: link
 * `/login?next=https://trang-gia.com` không được dẫn người vừa đăng nhập ra ngoài).
 * `//host` và `/\host` trình duyệt hiểu là URL tuyệt đối tới host khác, nên cũng bị chặn.
 */
export function safeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/servers';
  }
  return next;
}

let signedOutIntentionally = false;

export function markSignedOut(): void {
  signedOutIntentionally = true;
}

/**
 * Trang đăng nhập khi AuthGate thấy chưa đăng nhập. Phiên hết hạn: giữ trang đang đứng trong
 * `?next=` để đăng nhập lại xong quay về. Tự đăng xuất: không giữ — người đăng nhập tiếp theo
 * trên cùng trình duyệt không được dẫn tới trang (và lộ id server) của người trước.
 */
export function loginRedirectPath(currentPath: string): string {
  if (signedOutIntentionally) {
    signedOutIntentionally = false;
    return '/login';
  }
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
