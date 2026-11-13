import type { UpdateProfileInput } from '@ping/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { updateProfile, type ProfileUpdated } from '../api';

/** PATCH /users/me — ghi thẳng vào cache `me` để rail/popover đổi ngay không cần reload. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfile(input),
    onSuccess: (user) =>
      queryClient.setQueryData<ProfileUpdated | null>(qk.me, (old) =>
        old ? { ...old, displayName: user.displayName, avatarUrl: user.avatarUrl } : old,
      ),
  });
}
