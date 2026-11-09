'use client';

import { Table } from 'antd';
import type { ReactNode } from 'react';

type FieldKey<T> = Extract<keyof T, string>;

/** Cột không có `render` đọc field `key` của dòng nên `key` phải là field thật; có `render` thì `key` tự do. */
export type PingTableColumn<T> = {
  header: ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
} & ({ key: FieldKey<T>; render?: undefined } | { key: string; render: (row: T) => ReactNode });

export interface PingTableProps<T> {
  columns: PingTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Nội dung khi bảng rỗng. */
  empty?: ReactNode;
  /** Tên truy cập của bảng. */
  label?: string;
}

export function PingTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty = null,
  label,
}: PingTableProps<T>) {
  return (
    <Table
      data-testid="ping-table"
      aria-label={label}
      rowKey={rowKey}
      loading={loading}
      locale={{ emptyText: empty }}
      pagination={false}
      scroll={{ x: 'max-content' }}
      columns={columns.map((column) => ({
        key: column.key,
        title: column.header,
        dataIndex: column.key,
        // antd gọi render(value, record, index); API của PingTable là render(record).
        render: column.render ? (_value: unknown, record: T) => column.render?.(record) : undefined,
        width: column.width,
        align: column.align,
      }))}
      dataSource={rows}
    />
  );
}
