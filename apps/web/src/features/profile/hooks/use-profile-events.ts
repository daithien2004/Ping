'use client';

import {
  ServerEvents,
  type MemberUpdatedPayload,
  type ServerDetail,
  type ServerSummary,
  type ServerUpdatedPayload,
  type UserUpdatedPayload,
} from '@ping/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { MembersCache } from '@/features/members/member-cache';
import type { RealtimeSession } from '@/features/realtime/session';
import { onServerEvent } from '@/features/realtime/socket';
import { qk } from '@/lib/query-keys';
import type { ProfileUpdated } from '../api';
import {
  applyMemberUpdated,
  applyServerUpdated,
  applyUserUpdatedToMembers,
} from '../profile-cache';

export function useProfileEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const findMembersQueries = () =>
      queryClient
        .getQueryCache()
        .findAll({ predicate: (q) => q.queryKey[0] === 'servers' && q.queryKey[2] === 'members' });
    const off = [
      onServerEvent(session.socket, ServerEvents.UserUpdated, (event: UserUpdatedPayload) => {
        queryClient.setQueryData<ProfileUpdated | null>(qk.me, (old) =>
          old && old.id === event.id
            ? { ...old, displayName: event.displayName, avatarUrl: event.avatarUrl }
            : old,
        );
        for (const query of findMembersQueries())
          queryClient.setQueryData<MembersCache | undefined>(query.queryKey, (cache) =>
            applyUserUpdatedToMembers(cache, event),
          );
      }),
      onServerEvent(session.socket, ServerEvents.MemberUpdated, (event: MemberUpdatedPayload) => {
        for (const query of findMembersQueries())
          queryClient.setQueryData<MembersCache | undefined>(query.queryKey, (cache) =>
            applyMemberUpdated(cache, event),
          );
      }),
      onServerEvent(session.socket, ServerEvents.ServerUpdated, (event: ServerUpdatedPayload) => {
        const apply = (detail: ServerDetail | undefined, list: ServerSummary[] | undefined) =>
          applyServerUpdated(detail, list, event);
        queryClient.setQueryData<ServerDetail | undefined>(
          qk.server(event.id),
          (detail) => apply(detail, undefined).detail,
        );
        queryClient.setQueryData<ServerSummary[] | undefined>(
          qk.servers,
          (list) => apply(undefined, list).list,
        );
      }),
    ];
    return () => off.forEach((stop) => stop());
  }, [session, queryClient]);
}
