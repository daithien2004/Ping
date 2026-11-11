# Mẫu code

## Mục lục

- Hàm thuần cho fragment và phím tắt
- Hook một trách nhiệm
- Union thay cho boolean loại trừ
- Gốc ghép mỏng
- Test hàm thuần
- Mẫu báo cáo chẩn đoán

## Hàm thuần cho fragment và phím tắt

```ts
// emoji-fragment.ts: không React, test được trong vitest node
export function extractFragment(draft: string): string | null {
  return /:([a-z0-9_]{1,32})$/.exec(draft)?.[1] ?? null;
}

/** Bỏ `:fragment` ở cuối nháp, tùy chọn chèn `insert` vào chỗ đó. */
export const replaceFragment = (draft: string, fragment: string, insert = '') =>
  draft.slice(0, draft.length - fragment.length - 1) + insert;

export type SuggestionKeyAction =
  { type: 'move'; index: number } | { type: 'accept' } | { type: 'dismiss' };

export function suggestionKeyAction(
  key: string,
  index: number,
  count: number,
): SuggestionKeyAction | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return { type: 'move', index: (index + 1) % count };
  if (key === 'ArrowUp') return { type: 'move', index: (index - 1 + count) % count };
  if (key === 'Enter' || key === 'Tab') return { type: 'accept' };
  if (key === 'Escape') return { type: 'dismiss' };
  return null;
}
```

## Hook một trách nhiệm

```ts
// use-emoji-autocomplete.ts
export function useEmojiAutocomplete(
  draft: string,
  setDraft: (v: string) => void,
  serverId?: string,
) {
  const fragment = extractFragment(draft);
  const suggestions = useEmojiSuggestions(fragment, serverId);
  const [index, setIndex] = useState(0);
  const active = suggestions.length > 0 && fragment !== null;

  const accept = (i = index) => {
    /* dùng replaceFragment */
  };
  const dismiss = () => {
    /* dùng replaceFragment */
  };

  /** Trả true nếu đã xử lý phím (cha không xử lý tiếp). */
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!active) return false;
    const action = suggestionKeyAction(event.key, index, suggestions.length);
    if (!action) return false;
    event.preventDefault();
    switch (action.type) {
      case 'move':
        setIndex(action.index);
        break;
      case 'accept':
        accept();
        break;
      case 'dismiss':
        dismiss();
        break;
    }
    return true;
  }
  return { suggestions, index, active, accept, handleKey };
}
```

Cha chỉ còn: kiểm tra `isComposing` trước, rồi `if (autocomplete.handleKey(event)) return;`, rồi xử lý Enter gửi.

## Union thay cho boolean loại trừ

```ts
type Picker = 'emoji' | 'sticker' | null;
const [picker, setPicker] = useState<Picker>(null);
const toggle = (p: Exclude<Picker, null>) => setPicker((cur) => (cur === p ? null : p));
```

Chú ý hành vi: các chỗ chỉ đóng một picker nay đóng "picker hiện tại". Ghi trong báo cáo.

## Gốc ghép mỏng

```tsx
export function MessageComposer(props: MessageComposerProps) {
  const { ability, ready } = useServerAbility();
  const interactive = ready && ability.can('create', 'Message');
  const draft = useComposerDraft(props);
  const autocomplete = useEmojiAutocomplete(draft.value, draft.set, props.serverId ?? undefined);
  const recents = useRecentPicks();
  if (!ability.can('create', 'Message')) return <CannotSend />;
  return (/* ghép AttachmentTray, ReplyBar, picker, EmojiSuggestionList, toolbar */);
}
```

## Test hàm thuần

```ts
it('Escape/accept cắt đúng fragment', () => {
  expect(replaceFragment('xin :smi', 'smi')).toBe('xin ');
  expect(replaceFragment('xin :smi', 'smi', '😄')).toBe('xin 😄');
});
it('mũi tên quay vòng', () => {
  expect(suggestionKeyAction('ArrowUp', 0, 3)).toEqual({ type: 'move', index: 2 });
  expect(suggestionKeyAction('a', 0, 3)).toBeNull();
});
```

## Mẫu báo cáo chẩn đoán

1. Trách nhiệm tìm thấy (liệt kê).
2. Số liệu: prop, state, hook, JSX sâu.
3. Kịch bản thay đổi và số chỗ phải sửa.
4. Lỗi/rủi ro thật tìm thấy (mỗi cái một dòng, nói rõ chắc hay chưa chắc vì chưa mở hook).
5. Đề xuất cấu trúc + thứ tự làm.
6. Phần chưa đọc / chưa chạy.
