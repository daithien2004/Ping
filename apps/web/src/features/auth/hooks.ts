'use client';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setUnauthenticatedHandler } from '@/lib/api-client';
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
export function useMe() {
  return useSuspenseQuery({ queryKey: qk.me, queryFn: getSession, staleTime: Infinity });
}

/** Expired sessions must discard the same private cache as an intentional logout. */
export function useSessionExpiry() {
  const queryClient = useQueryClient();
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      queryClient.setQueryData(qk.me, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== qk.me[0] });
    });
    return () => setUnauthenticatedHandler(undefined);
  }, [queryClient]);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(qk.me, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => queryClient.setQueryData(qk.me, user),
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
      // Xóa mọi dữ liệu còn lại (server, tin nhắn...): người đăng nhập sau trên cùng trình
      // duyệt không được thấy dữ liệu của người trước.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== qk.me[0] });
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
