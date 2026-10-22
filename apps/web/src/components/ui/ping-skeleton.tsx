'use client';

import { Skeleton, type SkeletonProps as AntdSkeletonProps } from 'antd';

export type PingSkeletonProps = AntdSkeletonProps;

export function PingSkeleton(props: PingSkeletonProps) {
  return <Skeleton data-testid="ping-skeleton" {...props} />;
}
