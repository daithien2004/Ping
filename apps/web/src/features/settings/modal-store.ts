import { create } from 'zustand';

export type SettingsSectionKey =
  'account' | 'appearance' | 'language' | 'notifications' | 'privacy' | 'shortcuts';

export const useSettingsModal = create<{
  open: boolean;
  section: SettingsSectionKey;
  openSettings: (section?: SettingsSectionKey) => void;
  setSection: (section: SettingsSectionKey) => void;
  close: () => void;
}>((set) => ({
  open: false,
  section: 'account',
  openSettings: (section = 'account') => set({ open: true, section }),
  setSection: (section) => set({ section }),
  close: () => set({ open: false }),
}));
