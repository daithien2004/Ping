---
name: ping-component-structure
description: Quy ước cấu trúc component feature và quy ước UI của dự án Ping (React/Next, antd bọc thành Ping*, token, i18n, vitest node) để dễ bảo trì. Dùng skill này khi viết hoặc review màn hình, component, theme, i18n, trải nghiệm chat (chọn Ping* hay phần tử thô, token, ARIA, vi/en), hoặc khi người dùng hỏi về file component quá dài, "khó bảo trì", "tách component/hook", refactor một component có nhiều state hoặc nhiều trách nhiệm (composer, form, bảng, panel, drawer), khi review PR thêm tính năng vào component đã lớn, hoặc khi tạo component feature mới và cần quyết định chia file thế nào. Dùng cả khi họ chỉ dán một file dài và hỏi "có ổn không". Không dùng cho wrapper bọc antd trong components/ui (đó là skill ping-wrapper).
---

# Cấu trúc component feature để bảo trì được

## Nguyên tắc gốc

**Tách theo lý do thay đổi, không theo số dòng.** Một file 300 dòng chỉ có một lý do để đổi thì ổn; một file 120 dòng trộn gợi ý, upload, phím tắt và bố cục thì không. Dấu hiệu khó bảo trì thật sự: _một thay đổi nhỏ phải sửa nhiều nơi cách xa nhau trong file_ (state ở đầu, handler ở giữa, JSX ở cuối). Số dòng chỉ là tín hiệu để đi kiểm tra, không phải tiêu chí.

Mục tiêu: các thay đổi hay gặp (đổi hành vi gợi ý, thêm một nút, đổi giới hạn) chỉ chạm **một** file.

## Bước 0: chẩn đoán trước khi tách

Đọc kỹ rồi ghi ra, đừng tách theo cảm giác:

1. **Liệt kê trách nhiệm** (nội dung nháp, gợi ý, đính kèm, thanh trả lời, picker, báo gõ, quyền, bố cục...). Mỗi trách nhiệm là một ứng viên tách.
2. **Đếm:** số prop, số `useState`, số hook, độ sâu lồng JSX. Prop > ~8 hoặc state > ~5 là tín hiệu mạnh.
3. **Thử vài kịch bản thay đổi** ("đổi cách chấp nhận gợi ý", "thêm nút thứ ba vào thanh công cụ") và đếm mỗi kịch bản phải sửa mấy chỗ. Kịch bản nào sửa ≥3 chỗ cách xa nhau chỉ ra đúng đường cắt.
4. **Săn lỗi thật trong lúc đọc** (xem mục dưới). Việc đọc kỹ để tách thường lộ lỗi; ghi lại nhưng xử lý riêng.

Báo cáo chẩn đoán cho người dùng trước khi sửa. Nói rõ phần nào mới đọc, phần nào chưa mở (hook, API được gọi) và chưa chạy gì.

## Các lớp và quy tắc

Chi tiết và mẫu code ở `references/patterns.md`.

| Lớp                    | Chứa                                              | Quy tắc                                                            |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Hàm thuần (`*.ts`)     | xử lý chuỗi, tính chỉ số, ánh xạ phím → hành động | Không React, không side effect; test trực tiếp trong vitest node   |
| Hook (`use-*.ts`)      | state + logic của **một** trách nhiệm             | Trả ra giá trị và hành động tối thiểu; không trả JSX               |
| Component hiển thị     | JSX từ props                                      | Không state nghiệp vụ; tự gọi `useTranslations` cho chuỗi của mình |
| Gốc ghép (`index.tsx`) | gắn hook với component, chặn quyền, bố cục        | Mỏng; không chứa logic xử lý chuỗi                                 |

Quy tắc ngắn:

- **Phím tắt thành hàm thuần:** `suggestionKeyAction(key, index, count)` trả về hành động; handler chỉ `switch` kết quả. Test được mà không cần DOM (repo không có jsdom).
- **Boolean loại trừ nhau thành union:** `pickerOpen` + `stickerOpen` → `picker: 'emoji' | 'sticker' | null`. Trạng thái bất khả thi không còn biểu diễn được.
- **Một nguồn sự thật:** không để hai thứ cùng nói một điều (`dm` prop và `serverId === null`). Suy ra một từ cái còn lại.
- **Hằng số có tên, lấy từ nơi sở hữu:** giới hạn độ dài/số file nên đến từ schema dùng chung (`@ping/shared`), không gõ lại số.
- **Điều kiện lặp thành biến có tên:** `ready && canSend` xuất hiện nhiều lần → `const interactive = ready && canSend`.
- **Logic lặp thành hàm:** vd cắt fragment ở hai chỗ → `replaceFragment(draft, fragment, insert)`.
- **Giảm prop bằng cách đẩy phụ thuộc xuống lá:** component con tự gọi hook/dịch của mình thay vì nhận chuỗi đã dịch từ cha.
- **Wrapper hay phần tử thô:** xem mục "Dùng wrapper Ping hay phần tử thô" bên dưới.
- Callback cùng họ (`onSend`, `onSendSticker`, `onSendGif`) có thể gộp thành một `onSend(payload)` kiểu union, nhưng đó là đổi API công khai: cân nhắc kỹ.

## Quy ước UI của Ping

Áp dụng khi viết hoặc review màn hình, component, theme, i18n, trải nghiệm chat.

Đọc `apps/web/CLAUDE.md`, ADR-0023/0029 và ADR UI mới nếu đã accepted. Kiểm đúng Next/React/CSP đang dùng. Component nền tảng là antd 6 bọc thành `Ping*`; nguồn token duy nhất là `apps/web/src/lib/theme/tokens.ts`, sinh ra `styles/tokens.generated.css` (không sửa tay).

Checklist sau khi bộ Ping được duyệt:

- Feature dùng `Ping*` với Props riêng; antd chỉ trong `components/ui`.
- Wrapper mỏng: ref/test-id, hover/focus/active/disabled/loading, ARIA; token dùng chung sáng/tối.
- Form dùng schema shared qua adapter, không viết lại validation.
- Cache ở hooks, Query là server state, Zustand là UI state; UI quyền qua CASL và giữ nháp khi chưa ready.
- Chuỗi/ARIA vi/en, đủ trạng thái, reduced-motion, responsive, axe, screenshot và bundle theo task.

Đúng: thêm wrapper khi có use case, đo SSR/CSP/bundle trước quyết định. Sai: đổi antd và nới CSP để qua spike hoặc tạo cả bộ wrapper chưa ai dùng. Chưa có frontend-design cài sẵn thì báo thiếu, không giả vờ đã áp dụng; tài sản có giấy phép/nhận diện riêng của Ping.

### Dùng wrapper Ping hay phần tử thô

Áp dụng cho mọi thành phần UI (nút, input, select, modal, tag, tooltip...), không riêng nút.

1. Đã có `Ping*` cho thứ cần: dùng nó. Không import antd, không tự viết lại.
2. Nằm trong vùng tự thiết kế (ô soạn tin, picker, dòng danh sách, ô bảng) mà wrapper không hợp (cỡ, kiểu, cấu trúc): được dùng thẻ HTML thô, với điều kiện: class token (không hex), a11y đủ (tên truy cập cho phần tử chỉ icon, role, focus, disabled), `data-testid` khi test cần nhắm tới, `data-slot` kèm luật skin nếu cần skin riêng.
3. Cùng một kiểu thô lặp ở nhiều chỗ: tạo hoặc mở rộng wrapper thay vì chép lại.

Phần tử thô không nhận luật skin theo `data-slot` của wrapper; đó là cái giá của mục 2. Ví dụ với nút: `PingButton` cho nút thường, `PingIconButton` cho nút chỉ icon, `<button>` thô trong composer. Đổi thô sang wrapper làm đổi diện mạo: kiểm lại bằng mắt.

## Săn lỗi khi đọc (danh sách hay gặp)

- **IME/Telex:** kiểm tra `event.nativeEvent.isComposing` phải đứng **đầu** `onKeyDown`, trước mọi nhánh xử lý Enter/Tab (gợi ý, gửi). Nếu đứng sau, Enter chốt chữ tiếng Việt có thể bị bắt nhầm.
- **State khởi tạo một lần:** `useState(() => me ? load(me.id) : [])` không nạp lại khi `me` đến muộn. Cần effect hoặc state suy ra.
- **Hai nguồn cho cùng một sự thật** (xem trên).
- **Số ma thuật** lặp lại hoặc trùng với schema.
- **`useEffect` thiếu/ thừa dependency**, `requestAnimationFrame` không dọn.
- **Chặn quyền nằm rải rác** thay vì ở một chỗ.
- **Hành vi lệch khi gộp state:** gộp hai boolean thành union có thể đổi hành vi nhỏ (vd `submit` đóng picker nào). Ghi rõ trong báo cáo.

Mỗi lỗi tìm được: ghi vào báo cáo và nói rõ lỗi nào đã sửa.

## Thứ tự làm

Trước bước 1: đổi `<name>.tsx` thành `<name>/index.tsx` (nơi gọi vẫn import `<name>`) và đặt **mọi file mới sinh ra khi tách vào thư mục đó**, không để cạnh file gốc.

Làm lần lượt từng bước, chạy typecheck và test sau mỗi bước để cây luôn xanh:

1. **Hàm thuần + test.** Rủi ro thấp nhất.
2. **Component hiển thị** (không state): dễ vỡ ít nhất.
3. **Hook** (mỗi trách nhiệm một hook).
4. **Gộp state / dọn prop** (nếu đổi hành vi, ghi rõ).
5. **Sửa lỗi thật**, mỗi lỗi một bước riêng, kèm test nếu viết được.
6. **Đổi sang wrapper Ping / đổi diện mạo**, kèm ảnh trước/sau.
7. **Dọn cuối.** Quét lại mọi file đã chạm, kể cả file mới: xoá comment thuật lại code hoặc chỉ tham chiếu ticket/ADR, kể cả comment chính mình vừa viết; chỉ giữ comment ghi lý do không đọc ra được từ code. Rồi chạy lại typecheck, lint, test.

Các bước 1 đến 4 **giữ hành vi y nguyên**. Chạy e2e (các `data-testid` thường báo hiệu có e2e) trước và sau mỗi bước; nếu không có e2e thì bước 3 là bước nguy hiểm nhất, đi chậm và kiểm tay các luồng chính.

## Đừng làm

- Đừng chẻ thành nhiều file 10 đến 20 dòng chỉ để file ngắn. Hook chỉ dùng một nơi và vài dòng thì để lại trong `index.tsx`.
- Đừng dồn mọi thứ vào `utils.ts`/`helpers.ts`; đặt cạnh trách nhiệm sở hữu nó.
- Đừng viết lại cả component một lượt; đi từng bước nhỏ theo thứ tự trên.
- Đừng đổi tên `data-testid`/`data-slot` khi di chuyển code: test và skin bám vào chúng.
- Đừng khẳng định "đã ổn" khi chưa chạy typecheck/test; nói rõ phần chưa chạy.
- Chỉ viết comment khi thật sự cần: lý do không đọc ra được từ code (vd IME, ràng buộc ẩn, workaround). Không comment lại điều code đã nói, không để lại comment tham chiếu ticket/ADR dài; khi di chuyển code thì bỏ comment thừa thay vì chép theo.

## Cấu trúc thư mục gợi ý

```
feature-component/
  index.tsx                 # ghép, chặn quyền, bố cục
  <topic>.ts                # hàm thuần (+ <topic>.test.ts)
  use-<topic>.ts            # hook một trách nhiệm
  <part>.tsx                # component hiển thị
```

Giữ nguyên đường import công khai (qua `index.tsx`) để nơi gọi không phải sửa.

## Mẫu cấu trúc feature (chốt từ `features/messages`)

Áp dụng cho cả feature, không chỉ một component. Feature nhỏ giữ phẳng (xem `features/unread`: `api.ts`, `hooks.ts`, `*-cache.ts`). Khi một file có từ ba lý do thay đổi trở lên, hoặc vượt khoảng 300 dòng, đổi nó thành thư mục **cùng tên**, có `index.ts` re-export: đường import cũ (`../hooks`, `../message-cache`) không đổi.

```
features/<tên>/
  api.ts                    chỉ lời gọi REST có kiểu
  hooks/                    (hoặc hooks.ts khi nhỏ)
    index.ts                re-export tên công khai bằng danh sách tường minh
    use-<topic>.ts          mỗi file một lý do thay đổi: query, nghe event, đồng bộ, gửi, thao tác...
    cache-ops.ts            ghi và làm mới cache dùng chung (writeX, refetchX)
    <topic>.test.ts         test cạnh code
  <tên>-cache/              (hoặc <tên>-cache.ts khi nhỏ) hàm thuần biến đổi cache, KHÔNG import React
    types.ts  core.ts  <topic>.ts   chia theo chủ đề
    index.ts                re-export tên công khai; helper nội bộ không re-export
    <topic>.test.ts  test-helpers.ts
  <topic>.ts (+ .test.ts)   hàm thuần theo chủ đề nhỏ (markdown, grouping...)
  store.ts                  chỉ UI state (Zustand)
  components/<Tên>/         một thư mục mỗi component có nhiều phần (index.tsx + hook + phần giao diện)
```

Quy tắc đã chốt:

- **Chiều phụ thuộc trong feature:** `components → hooks → <tên>-cache` và `api`. Cache không biết hooks; hooks không biết components. Nếu hook cần một hàm nằm ở components thì chuyển hàm đó xuống cache.
- **Test được mà không cần React:** logic ghi cache của hook viết thành `createX(queryClient, ...)` hoặc hàm module nhận `queryClient` (ví dụ `createMessageActions`, `patchFromTail`) rồi hook chỉ gọi nó. Môi trường test là node, không có jsdom.
- **Không lặp:** bước `pages.map(page => ({...page, messages: ...}))` thành một hàm (`mapPages`, `patchMessage`); điều kiện lặp thành hàm có tên (`isTransient`); công thức chỉ có một nơi (`toggledCount`); hằng số dùng chung đặt ở nơi sở hữu (`@ping/shared`).
- **Tách dữ liệu gửi API khỏi metadata chỉ dùng phía client:** biến của mutation là `{ input, preview }`, không trộn preview vào object gửi lên server rồi bóc ra bằng destructure thừa.
- **Handler sống lâu cần giá trị mới nhất** (ví dụ id người dùng): đọc qua `ref` cập nhật trong effect, đừng đưa vào deps làm gỡ và gắn lại listener.
- **Nhánh logic của hook** (dựng dữ liệu gửi lại, chọn ca xử lý) rút thành hàm thuần có test (ví dụ `retryVariables`); hook chỉ nối kết quả vào mutation.
- **Đăng ký event socket** bằng helper có kiểu (`listen(socket, event, handler)` trả hàm gỡ), không viết tay từng cặp `on`/`off`.
- **File con ngắn:** mục tiêu mỗi file dưới khoảng 220 dòng; file thuần giữ trọn một chủ đề (ví dụ parser) thì được dài hơn.
- **Test đặt cạnh file nó kiểm**, tách theo module. Fixture dùng chung nằm trong `test-helpers.ts`.
- Cụm cấu trúc này dùng lại cho feature lớn khác (`channels`, `admin`): đừng phát minh khuôn mới.

## Checklist review PR đụng vào component lớn

- [ ] Thay đổi chỉ chạm một trách nhiệm, hay lại rải khắp file?
- [ ] State mới có nên là hook riêng / union thay vì thêm một boolean nữa?
- [ ] Có điều kiện, hằng số, đoạn cắt chuỗi bị lặp lại không?
- [ ] Phím tắt/IME: `isComposing` ở đầu handler?
- [ ] Logic mới có tách thành hàm thuần và có test không?
- [ ] `data-testid`/`data-slot` còn nguyên?
- [ ] File mới nằm trong thư mục của component gốc (`<name>/index.tsx`), không rải cạnh nó?
- [ ] Với feature: file nào vượt khoảng 300 dòng hoặc có từ ba lý do thay đổi đã thành thư mục có `index.ts` chưa? Chiều phụ thuộc `components → hooks → cache` còn đúng?
- [ ] Comment còn lại đều ghi lý do không đọc ra được từ code? Không có comment chép theo hay tham chiếu ticket?
