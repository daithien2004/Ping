import { create } from 'zustand';

/**
 * UI state (TG.9): các partner mình BIẾT đang bị chặn hai chiều — không có endpoint liệt kê
 * trong v0.2 nên đây chỉ là ghi nhận phiên làm việc, gồm hai nguồn:
 * 1. chính mình vừa chặn qua UI (profile card / header DM);
 * 2. gửi tin gặp 403 `DM_BLOCKED` (API dùng chung một mã cho cả hai chiều để chống dò,
 *    ADR-0070 mục 3-4) — banner + tắt composer cho tới khi biết thêm thông tin mới.
 * Reload trang làm mất ghi nhận — cạnh đó đối soát bằng response lỗi của server.
 */
interface DmBlockState {
  /** partner userId → đang chặn (theo một trong hai chiều, client không phân biệt được). */
  blocked: Record<string, true>;
  setBlocked: (userId: string, blocked: boolean) => void;
}

export const useDmBlockStore = create<DmBlockState>((set) => ({
  blocked: {},
  setBlocked: (userId, blocked) =>
    set((state) => {
      if (Boolean(state.blocked[userId]) === blocked) return state;
      const next = { ...state.blocked };
      if (blocked) next[userId] = true;
      else delete next[userId];
      return { blocked: next };
    }),
}));

/** Selector: biết là đang chặn (theo một trong hai chiều) với partner này không. */
export const selectDmBlocked = (userId: string) => (state: DmBlockState) =>
  Boolean(state.blocked[userId]);
