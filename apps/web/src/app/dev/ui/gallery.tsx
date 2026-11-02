'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy, Pin } from 'lucide-react';
import { PingAlert } from '@/components/ui/ping-alert';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingBadge } from '@/components/ui/ping-badge';
import { PingButton } from '@/components/ui/ping-button';
import { PingCheckbox } from '@/components/ui/ping-checkbox';
import { PingContextMenu } from '@/components/ui/ping-context-menu';
import { PingDivider } from '@/components/ui/ping-divider';
import { PingDrawer } from '@/components/ui/ping-drawer';
import { PingDropdown } from '@/components/ui/ping-dropdown';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingForm, PingFormItem, usePingForm } from '@/components/ui/ping-form';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingKbd } from '@/components/ui/ping-kbd';
import { PingLabel } from '@/components/ui/ping-label';
import { PingMentionInput } from '@/components/ui/ping-mention-input';
import { PingMenu } from '@/components/ui/ping-menu';
import { PingModal } from '@/components/ui/ping-modal';
import { PingPasswordInput } from '@/components/ui/ping-password-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingPopover } from '@/components/ui/ping-popover';
import { PingRadioGroup } from '@/components/ui/ping-radio-group';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { PingSelect } from '@/components/ui/ping-select';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { PingSpinner } from '@/components/ui/ping-spinner';
import { PingSteps } from '@/components/ui/ping-steps';
import { PingSwitch } from '@/components/ui/ping-switch';
import { PingTable } from '@/components/ui/ping-table';
import { PingTabs } from '@/components/ui/ping-tabs';
import { PingTag } from '@/components/ui/ping-tag';
import { PingTextArea } from '@/components/ui/ping-textarea';
import { pingToast } from '@/components/ui/ping-toast';
import { PingTooltip } from '@/components/ui/ping-tooltip';

/**
 * Kho giao diện dev (0.2): mỗi wrapper `Ping*` xuất hiện ít nhất một lần để mắt người và
 * `audit:design` nhìn thấy đủ bộ. Trang chỉ dựng khi `next dev` (xem page.tsx) — e2e và visual
 * chạy bản production nên không phụ thuộc trang này.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const menuItems = [
  { key: 'edit', label: 'Chỉnh sửa' },
  { key: 'reply', label: 'Trả lời' },
  { key: 'delete', label: 'Xoá', danger: true },
];

const tableRows = [
  { id: '1', name: 'Quảng Đại Thiện', role: 'Chủ server' },
  { id: '2', name: 'Bob', role: 'Thành viên' },
];

export function DevUiGallery() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = usePingForm<{ name: string }>();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 bg-background px-6 py-8 text-foreground">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Kho giao diện (dev)</h1>
        <p className="text-sm text-muted-foreground">
          Mọi component nền tảng đi qua bộ <code className="text-xs">Ping*</code> — chỉ trang này
          được dựng khi chạy <code className="text-xs">next dev</code>.
        </p>
      </header>

      <Section title="Nút và hành động">
        <Row label="PingButton — variant, size, trạng thái">
          <PingButton>Chính</PingButton>
          <PingButton variant="secondary">Phụ</PingButton>
          <PingButton variant="ghost">Nhạt</PingButton>
          <PingButton variant="danger">Nguy hiểm</PingButton>
          <PingButton size="sm">Nhỏ</PingButton>
          <PingButton size="lg">Lớn</PingButton>
          <PingButton loading>Đang lưu</PingButton>
          <PingButton disabled>Vô hiệu</PingButton>
        </Row>
        <Row label="PingIconButton — luôn có aria-label">
          <PingIconButton icon={<Copy />} aria-label="Sao chép liên kết" />
          <PingIconButton icon={<Pin />} aria-label="Ghim tin" />
          <PingIconButton icon={<Check />} aria-label="Đánh dấu đã đọc" />
        </Row>
      </Section>

      <Section title="Nhập liệu">
        <Row label="PingLabel + PingInput — size">
          <div className="flex w-full max-w-sm flex-col gap-2">
            <PingLabel htmlFor="gallery-input">Tên hiển thị</PingLabel>
            <PingInput id="gallery-input" placeholder="Nhập tên" />
          </div>
          <PingInput size="sm" placeholder="Nhỏ" />
          <PingInput size="lg" placeholder="Lớn" />
          <PingInput disabled placeholder="Vô hiệu" />
        </Row>
        <Row label="PingPasswordInput">
          <PingPasswordInput
            placeholder="Mật khẩu"
            autoComplete="current-password"
            aria-label="Mật khẩu"
          />
        </Row>
        <Row label="PingTextArea">
          <PingTextArea
            placeholder="Soạn tin nhắn"
            aria-label="Soạn tin nhắn"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Row>
        <Row label="PingMentionInput">
          <PingMentionInput
            placeholder="Gõ @ để nhắc ai đó"
            aria-label="Nhắc thành viên"
            options={[{ value: 'bob', label: 'Bob' }]}
          />
        </Row>
        <Row label="PingCheckbox / PingRadioGroup / PingSwitch / PingSegmented">
          <PingCheckbox defaultChecked>Thông báo</PingCheckbox>
          <PingRadioGroup
            defaultValue="a"
            options={[
              { value: 'a', label: 'Mọi người' },
              { value: 'b', label: 'Chỉ tôi' },
            ]}
          />
          <PingSwitch defaultChecked aria-label="Bật thông báo" />
          <PingSegmented options={['Ngày', 'Tuần']} />
        </Row>
        <Row label="PingSelect">
          <PingSelect
            className="w-48"
            placeholder="Chọn kênh"
            options={[
              { value: 'general', label: '# chung' },
              { value: 'random', label: '# ngẫu nhiên' },
            ]}
          />
          <PingSelect className="w-48" disabled placeholder="Vô hiệu" options={[]} />
        </Row>
        <Row label="PingForm (zod → antd form)">
          <PingForm
            form={form}
            layout="vertical"
            className="w-full max-w-sm"
            onFinish={() => pingToast.success('Form hợp lệ')}
          >
            <PingFormItem
              name="name"
              label="Tên kênh"
              rules={[{ required: true, message: 'Nhập tên kênh' }]}
            >
              <PingInput placeholder="vd: thông báo" />
            </PingFormItem>
            <PingButton htmlType="submit" size="sm">
              Gửi
            </PingButton>
          </PingForm>
        </Row>
      </Section>

      <Section title="Phản hồi và trạng thái">
        <Row label="PingAlert">
          <PingAlert className="w-full" type="info" title="Thông tin" />
          <PingAlert className="w-full" type="success" title="Thành công" />
          <PingAlert className="w-full" type="warning" title="Cảnh báo" />
          <PingAlert className="w-full" type="error" title="Lỗi" description="Mô tả lỗi ngắn." />
        </Row>
        <Row label="PingTag / PingBadge">
          <PingTag>Mặc định</PingTag>
          <PingTag color="green">Đã xác minh</PingTag>
          <PingBadge count={5}>
            <PingButton variant="secondary">Hộp thư</PingButton>
          </PingBadge>
          <PingBadge dot>
            <PingAvatar presence="online">P</PingAvatar>
          </PingBadge>
        </Row>
        <Row label="PingAvatar — presence">
          <PingAvatar presence="online">P</PingAvatar>
          <PingAvatar presence="idle">B</PingAvatar>
          <PingAvatar presence="dnd">C</PingAvatar>
          <PingAvatar presence="offline">D</PingAvatar>
        </Row>
        <Row label="PingSpinner / PingSkeleton">
          <PingSpinner size="small" />
          <PingSpinner />
          <PingSkeleton active />
          <PingSkeleton block className="h-10 w-40" />
          <PingSkeleton block className="size-12 rounded-full" />
        </Row>
        <Row label="PingEmpty">
          <PingEmpty description="Chưa có tin nhắn" />
        </Row>
        <Row label="PingSteps">
          <PingSteps
            current={1}
            items={[{ title: 'Tạo server' }, { title: 'Mời bạn' }, { title: 'Bắt đầu' }]}
          />
        </Row>
        <Row label="PingToast — chỉ cho hành động ngầm">
          <PingButton variant="secondary" onClick={() => pingToast.success('Đã sao chép')}>
            Toast thành công
          </PingButton>
          <PingButton variant="secondary" onClick={() => pingToast.error('Không sao chép được')}>
            Toast lỗi
          </PingButton>
          <PingButton variant="secondary" onClick={() => pingToast.info('Đang tải')}>
            Toast thông tin
          </PingButton>
        </Row>
      </Section>

      <Section title="Lớp phủ">
        <Row label="PingTooltip / PingPopover">
          <PingTooltip title="Nhấn để sao chép">
            <PingButton variant="secondary">Rê chuột</PingButton>
          </PingTooltip>
          <PingPopover content={<p className="text-sm">Nội dung popover</p>}>
            <PingButton variant="secondary">Mở popover</PingButton>
          </PingPopover>
        </Row>
        <Row label="PingDropdown / PingContextMenu">
          <PingDropdown trigger={['click']} menu={{ items: menuItems }}>
            <PingButton variant="secondary">Menu</PingButton>
          </PingDropdown>
          <PingContextMenu menu={{ items: menuItems }}>
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              Bấm chuột phải vào đây
            </div>
          </PingContextMenu>
        </Row>
        <Row label="PingPopconfirm">
          <PingPopconfirm title="Xoá tin nhắn?" onConfirm={() => pingToast.info('Đã xoá')}>
            <PingButton variant="danger">Xoá</PingButton>
          </PingPopconfirm>
        </Row>
        <Row label="PingModal / PingDrawer">
          <PingButton variant="secondary" onClick={() => setModalOpen(true)}>
            Mở modal
          </PingButton>
          <PingButton variant="secondary" onClick={() => setDrawerOpen(true)}>
            Mở ngăn kéo
          </PingButton>
          <PingModal
            title="Hộp thoại"
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => setModalOpen(false)}
          >
            <p className="text-sm">Nội dung hộp thoại.</p>
          </PingModal>
          <PingDrawer
            title="Chi tiết"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            size={360}
          >
            <p className="text-sm">Nội dung ngăn kéo.</p>
          </PingDrawer>
        </Row>
      </Section>

      <Section title="Dữ liệu và điều hướng">
        <Row label="PingTable">
          <PingTable
            label="Thành viên"
            rowKey={(row) => row.id}
            rows={tableRows}
            columns={[
              { key: 'name', header: 'Tên', render: (row) => row.name },
              { key: 'role', header: 'Vai trò', render: (row) => row.role },
            ]}
          />
        </Row>
        <Row label="PingTabs">
          <PingTabs
            className="w-full"
            items={[
              { key: 'members', label: 'Thành viên', children: 'Danh sách thành viên' },
              { key: 'pins', label: 'Tin ghim', children: 'Danh sách tin ghim' },
            ]}
          />
        </Row>
        <Row label="PingMenu">
          <PingMenu
            mode="inline"
            className="w-full max-w-xs"
            selectedKeys={['edit']}
            items={menuItems}
          />
        </Row>
        <Row label="PingDivider / PingKbd">
          <PingDivider className="w-full">hoặc</PingDivider>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Nhấn <PingKbd>K</PingKbd> để mở tìm kiếm nhanh
          </span>
        </Row>
      </Section>
    </main>
  );
}
