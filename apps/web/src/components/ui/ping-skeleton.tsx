'use client';

import { Skeleton, type SkeletonProps as AntdSkeletonProps } from 'antd';
import { cn } from '@/lib/utils';

export interface PingSkeletonProps extends AntdSkeletonProps {
  block?: boolean;
}

export function PingSkeleton({ block, className, ...rest }: PingSkeletonProps) {
  if (block) {
    return (
      <div
        aria-hidden
        data-testid="ping-skeleton"
        className={cn('animate-pulse rounded-md bg-muted', className)}
      />
    );
  }
  return <Skeleton data-testid="ping-skeleton" className={className} {...rest} />;
}
