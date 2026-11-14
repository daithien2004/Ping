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
export function useMe() {
  return useSuspenseQuery({ queryKey: qk.me, queryFn: getSession, staleTime: Infinity });
}

/** Expired sessions must discard the same private cache as an intentional logout. */
export function useSessionExpiry() {
  const queryClient = useQueryClient();
  useEffect(() => {
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
      markSignedOut();
      queryClient.setQueryData(qk.me, null);
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyEmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: resendVerification });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: forgotPassword });
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

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

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}
