import { create } from 'zustand';

/** UI state: panel thành viên đang mở hay ẩn (mặc định mở). Không giữ dữ liệu server. */
export const useMemberPanel = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}>((set) => ({
  open: true,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
