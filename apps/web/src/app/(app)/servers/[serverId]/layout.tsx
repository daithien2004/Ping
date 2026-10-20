import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { ChannelSidebar } from '@/features/channels/components/channel-sidebar';
import {
  ServerAbilityProvider,
  ServerViewBoundary,
} from '@/features/permissions/components/server-ability-provider';

export default function ServerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ serverId: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <ServerAbilityProvider params={params}>
        <Suspense fallback={<aside className="w-60 bg-sidebar" />}>
          <ChannelSidebar />
        </Suspense>
        <ServerViewBoundary>
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </ServerViewBoundary>
      </ServerAbilityProvider>
    </Suspense>
  );
}
