import { create } from 'zustand';

/** UI state: panel thành viên đang mở hay ẩn (mặc định mở). Không giữ dữ liệu server. */
export const useMemberPanel = create<{ open: boolean; toggle: () => void }>((set) => ({
  open: true,
  toggle: () => set((state) => ({ open: !state.open })),
}));
