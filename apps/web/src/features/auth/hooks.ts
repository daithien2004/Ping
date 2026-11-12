'use client';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setUnauthenticatedHandler } from '@/lib/api-client';
import { clearSessionQueries } from '@/lib/query-client';
import { qk } from '@/lib/query-keys';
import {
  changePassword,
  forgotPassword,
  getSession,
  listSessions,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  verifyEmail,
} from './api';
import { markSignedOut } from './session';

/**
 * Người dùng hiện tại (null = chưa đăng nhập). Chỉ dùng dưới `use(browser())`: phiên chỉ có
 * trong trình duyệt. staleTime vô hạn: không cần hỏi lại định kỳ — đăng nhập/đăng xuất và
 * phiên hết hạn đều tự cập nhật cache này.
 */
/**
 * Ví dụ kết quả query:
 * { data: { id: 'u1', username: 'An' }, isLoading: false }
 * Nếu chưa đăng nhập, `data` là `null`.
 */
export function useMe() {
  return useSuspenseQuery({ queryKey: qk.me, queryFn: getSession, staleTime: Infinity });
}

/** Expired sessions must discard the same private cache as an intentional logout. */
export function useSessionExpiry() {
  const queryClient = useQueryClient();
  useEffect(() => {
    // Chỉ đặt `me = null`; AuthGate xóa các query còn lại sau khi cây `(app)` đã unmount —
    // removeQueries trên query đang có observer sẽ refetch bằng token vừa bị xóa.
    setUnauthenticatedHandler(() => {
      queryClient.setQueryData(qk.me, null);
    });
    return () => setUnauthenticatedHandler(undefined);
  }, [queryClient]);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      // Phiên mới không được kế thừa query/lỗi của phiên trước: request cũ có thể vẫn đang bay
      // và kịp ghi lỗi 401 vào cache trong lúc màn đăng nhập mở.
      clearSessionQueries(queryClient);
      queryClient.setQueryData(qk.me, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      clearSessionQueries(queryClient);
      queryClient.setQueryData(qk.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // AuthGate sẽ về /login không kèm ?next= (không dẫn người sau tới trang của người trước).
      markSignedOut();
      // Đặt me = null TRƯỚC: AuthGate đang theo dõi query này sẽ chuyển về /login.
      // (Không dùng queryClient.clear(): nó xóa luôn query `me`, AuthGate mất theo dõi và
      // không bao giờ biết đã đăng xuất — đã gặp khi kiểm tra trong trình duyệt.)
      queryClient.setQueryData(qk.me, null);
      // Dữ liệu còn lại (server, tin nhắn...) do AuthGate xóa ngay sau khi nó unmount cây
      // `(app)` — xóa tại đây, khi AppShell còn observer, sẽ refetch bằng token vừa bị xóa.
      // `useLogin` cũng xóa trước khi đặt phiên mới, phòng request cũ về muộn.
    },
  });
}

/* TG.8 — vòng đời tài khoản. */

/**
 * POST /auth/verify-email: thành công thì làm tươi `me` — nếu người dùng đang đăng nhập trên
 * trình duyệt này (xác minh ngay sau đăng ký), banner chưa xác minh tắt và chính sách
 * VERIFY_REQUIRED được gỡ mà không cần đăng nhập lại.
 */
export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyEmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** POST /auth/verify-email/resend — không đụng cache: chỉ báo thành công cho người dùng. */
export function useResendVerification() {
  return useMutation({ mutationFn: resendVerification });
}

/** POST /auth/password/forgot — server luôn trả 202; UI hiện câu trung lập như nhau. */
export function useForgotPassword() {
  return useMutation({ mutationFn: forgotPassword });
}

/** POST /auth/password/reset — server thu hồi mọi phiên; caller điều hướng về /login. */
export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

/**
 * PATCH /users/me/password: phiên hiện tại vẫn giữ, các phiên khác bị thu hồi ở server —
 * làm tươi danh sách phiên để các dòng biến mất ngay.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

/** GET /users/me/sessions — staleTime 30s: danh sách chỉ đổi khi đăng nhập/thu hồi ở nơi khác. */
export function useSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: listSessions, staleTime: 30_000 });
}

/** DELETE /users/me/sessions/:sessionId — làm tươi danh sách sau khi thu hồi. */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

/** DELETE /users/me/sessions — thu hồi mọi phiên khác, làm tươi danh sách. */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}
