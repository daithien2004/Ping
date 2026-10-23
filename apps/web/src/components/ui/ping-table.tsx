'use client';

import { Table } from 'antd';
import type { ReactNode } from 'react';

/**
 * API riêng của `PingTable` (ADR-0050): không rò prop antd ra ngoài. Cột được mô tả bằng
 * `header` + `render` (không phải `title`/`dataIndex` của antd) để đổi thư viện sau này
 * không phải sửa nơi dùng.
 */
export interface PingTableColumn<T> {
  /** Khoá cột — dùng làm `dataIndex` và định danh ô. */
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
}

export interface PingTableProps<T> {
  columns: PingTableColumn<T>[];
  rows: T[];
  /** Khoá duy nhất của mỗi dòng (id của bản ghi). */
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Nội dung khi bảng rỗng (dùng `PingEmpty` theo quy ước TF.9). */
  empty?: ReactNode;
  /** Tên truy cập của bảng (đọc bằng trình đọc màn hình). */
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
