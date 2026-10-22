'use client';

import { Table, type TableProps as AntdTableProps } from 'antd';

export type PingTableProps<T> = AntdTableProps<T>;

export function PingTable<T>(props: PingTableProps<T>) {
  return <Table data-testid="ping-table" {...props} />;
}
