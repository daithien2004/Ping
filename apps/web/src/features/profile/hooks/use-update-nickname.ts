import type { UpdateNicknameInput } from '@ping/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MembersCache } from '@/features/members/member-cache';
import { qk } from '@/lib/query-keys';
import { updateMyNickname } from '../api';
import { applyMemberUpdated } from '../profile-cache';

export function useUpdateNickname(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNicknameInput) => updateMyNickname(serverId, input),
    onSuccess: (result) => {
      const apply = (cache: MembersCache | undefined) =>
        applyMemberUpdated(cache, {
          serverId,
          memberId: result.id,
          nickname: result.nickname,
          user: result.user,
        });
      for (const query of queryClient.getQueryCache().findAll({ queryKey: qk.members(serverId) }))
        queryClient.setQueryData(
          query.queryKey,
          apply(query.state.data as MembersCache | undefined),
        );
    },
  });
}
