'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { getSession, login, logout, register } from './api';

/**
 * Người dùng hiện tại (null = chưa đăng nhập). Chỉ dùng dưới `use(browser())`: phiên chỉ có
 * trong trình duyệt. staleTime vô hạn: không cần hỏi lại định kỳ — đăng nhập/đăng xuất và
 * phiên hết hạn đều tự cập nhật cache này.
 */
export function useMe() {
  return useSuspenseQuery({ queryKey: qk.me, queryFn: getSession, staleTime: Infinity });
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
