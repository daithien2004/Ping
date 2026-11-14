import { create } from 'zustand';

export const useMobileNav = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  close: () => set({ open: false }),
}));
