import { create } from 'zustand';

/** UI state: drawer điều hướng ở màn hẹp (<md). Không giữ dữ liệu server. */
export const useMobileNav = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  close: () => set({ open: false }),
}));
