# Triển khai: emoji tùy chỉnh đã bị xóa còn sót trên giao diện

Tài liệu giao việc cho người hoặc agent triển khai. Đọc hết mục "Bối cảnh" và "Quyết định" trước khi
sửa code. Căn cứ Discord: [Thực hành của Discord](discord-practices.md); ADR liên quan: ADR-0068
(emoji tùy chỉnh), ADR-0064 (cảm xúc), ADR-0080 (rate limit).

**Trạng thái (2026-11-06):** việc 1–4 đã merge vào `main` (CI xanh). Việc 5 làm trên nhánh
`chore/e2e-csdl-rieng` theo [ADR-0082](adr/0082-csdl-rieng-cho-e2e-web.md). Dữ liệu `test_emoji` trong
playground dev đã dọn theo yêu cầu của chủ dự án (83 tin, 54 reaction; 29 emoji xóa mềm giữ lại).

## Bối cảnh

Trên server `Ping Playground`, các tin có emoji tùy chỉnh đã xóa hiện chip mờ `:test_emoji:`, còn
pill reaction hiện nhãn thô `c:2713f875`. Đây là hai hành vi được thiết kế sẵn và có e2e kiểm tra
(`apps/web/e2e/emoji-custom.spec.ts`, bài "xóa → placeholder + pill degrade"). Điều tra cho thấy
chúng che một lỗi chức năng và một điểm thiết kế yếu.

Dữ liệu quan sát (2026-11-06, bản dev): cache tin nhắn có nội dung `:test_emoji:<uuid>` và reaction
`c:<uuid>` với hai id khác nhau, trong khi `GET /servers/:id/emojis` trả 200 với danh sách rỗng.
Tên `test_emoji` trùng `EMOJI_NAME` của spec e2e, và `playwright.config.ts` đặt
`reuseExistingServer: true`, dùng chung CSDL `ping` với server dev (`.env.example`). Nhiều khả năng
e2e đã để lại dữ liệu trong CSDL dev; chưa xác minh trực tiếp bằng truy vấn CSDL.

### Vấn đề 1 (lỗi chức năng): không gỡ được reaction của emoji đã xóa

`MessagesService.removeReaction` (`apps/api/src/modules/messages/messages.service.ts`, quanh dòng 1022) gọi `assertCustomReactionEmoji`, hàm này chỉ chấp nhận emoji còn sống
(`deletedAt: null`) và ném `REACTION_EMOJI_INVALID` (HTTP 400) nếu không. Hậu quả:

- Người đã thả reaction bằng emoji X, sau đó X bị xóa, bấm pill để gỡ thì nhận lỗi 400 và toast
  "emoji không hợp lệ". Reaction của chính họ không gỡ được.
- Reaction mồ côi vẫn chiếm một trong `Limits.REACTIONS_PER_MESSAGE` (20) loại reaction của tin
  đó, và không còn đường nào để dọn.

Việc chặn khi **thêm** reaction bằng emoji đã xóa là đúng và giữ nguyên. Chỉ nhánh **gỡ** sai.
Lưu ý: bài e2e `apps/api/test/emojis.e2e-spec.ts` (dòng khoảng 380) chỉ kiểm chặn khi thêm, không có
ca gỡ sau khi xóa emoji nên lỗi không bị bắt.

### Vấn đề 2 (thiết kế): pill của emoji đã xóa lộ id và mất tên

Khi emoji đã xóa, client không còn dữ liệu để dựng nhãn, nên pill hiện `c:<8 ký tự cuối>` (lộ một
phần UUID, không nghĩa). Ping dùng soft-delete (`CustomEmoji.deletedAt`) nên **tên vẫn còn trong
CSDL**, chỉ chưa được trả ra.

### Vấn đề 3 (vận hành): e2e ghi vào CSDL dev

E2E không tách CSDL khỏi dev nên mỗi lần chạy có thể để lại emoji, tin và reaction trong playground.
Không phải lỗi sản phẩm, nhưng chính nó làm hai vấn đề trên hiện ra trên giao diện dev.

## Căn cứ từ Discord (đã đọc tài liệu chính thức)

- Token trong tin là `<:NAME:ID>`; ID là nguồn sự thật, tên chỉ để hiển thị.
- Đối tượng emoji trong **reaction** có thể có `name: null` khi dữ liệu emoji đã mất (ví dụ sau khi
  xóa). Tức là reaction có thể sống lâu hơn emoji và client phải chịu được thiếu tên.
- Tài liệu **không** mô tả việc tự xóa reaction khi xóa emoji, nên không có cơ sở để Ping làm vậy.
- Gỡ reaction của người khác và xóa mọi reaction của một emoji cần `MANAGE_MESSAGES`.
- Chưa tìm được nguồn công khai nói client Discord hiển thị reaction của emoji đã xóa ra sao; phần
  hiển thị dưới đây là quyết định của Ping, không phải sao chép Discord.

## Quyết định

1. **Giữ reaction khi xóa emoji** (không xóa dây chuyền). Lý do: khớp tinh thần tài liệu Discord,
   không mất dữ liệu người dùng, không cần migration.
2. **Cho gỡ reaction của emoji đã xóa**, chỉ với reaction của chính người gọi. Vẫn kiểm token thuộc
   đúng server của tin (kể cả emoji đã xóa), nên token của server khác hay id lạ vẫn bị chặn như cũ
   và không lộ sự tồn tại của emoji ở server khác.
3. **Trả thêm tên emoji trong `MessageReactionDto`** (trường tùy chọn, thêm mới theo quy tắc 13
   expand/contract, client cũ bỏ qua được). Pill của emoji đã xóa hiện `:ten:` như chip trong tin,
   thay cho `c:<id>`.
4. **Khi không có tên** (dữ liệu cũ, tab chưa tải lại), pill hiện biểu tượng chung "emoji đã xóa"
   kèm tooltip, không bao giờ hiện UUID.
5. **Sự kiện realtime giữ nguyên.** `reaction.added` và `reaction.removed` chỉ mang token; emoji lúc
   thêm luôn còn sống nên client resolve được qua cache. Không đổi payload.
6. Cần một ADR ngắn (số kế tiếp là 0081) ghi lại các quyết định 1–4 theo quy tắc 15.

## Việc cần làm

Làm theo thứ tự; mỗi việc một commit.

### Việc 1. Gỡ được reaction của emoji đã xóa (API, sửa lỗi)

- Trong `messages.service.ts`, tách kiểm tra của `removeReaction` khỏi `assertCustomReactionEmoji`.
  Ví dụ thêm tham số `{ allowDeleted: boolean }` hoặc một hàm `assertOwnedReactionEmoji` mới: với
  token `c:<id>`, tìm `customEmoji.findFirst({ where: { id, serverId } })` **không** lọc
  `deletedAt`; không thấy thì vẫn ném `REACTION_EMOJI_INVALID`. Trong DM (`serverId === null`) giữ
  nguyên việc chặn.
- Giữ nguyên `addReaction` (vẫn chặn emoji đã xóa).
- `deleteMany({ where: { messageId, userId, emoji } })` đã giới hạn theo `userId` của người gọi, giữ
  nguyên.
- Test (thêm vào `apps/api/test/emojis.e2e-spec.ts`, cạnh ca "reaction token c:<id>"):
  - Thả reaction `c:<id>` khi emoji còn sống, xóa mềm emoji, rồi gỡ: kỳ vọng 200 và danh sách
    reaction không còn token đó.
  - Thêm reaction bằng emoji đã xóa: vẫn 400 `REACTION_EMOJI_INVALID`.
  - Gỡ bằng token của server khác hoặc id không tồn tại: vẫn 400 `REACTION_EMOJI_INVALID`.
  - Người khác không thể gỡ reaction của mình bằng cách này (kiểm `userId`, bám quy tắc 16 về IDOR).
- Ghi nhanh trong commit rằng lỗi này khiến reaction mồ côi chiếm slot trong giới hạn 20 loại.

### Việc 2. Trả tên emoji trong reaction (shared + API)

- `packages/shared/src/schemas/message.ts`: thêm vào `MessageReactionDto` trường tùy chọn
  `emojiName?: string`. Cập nhật mọi schema zod/type dùng chung nếu có; chạy
  `pnpm --filter shared build` nếu repo yêu cầu (có thư mục `packages/shared/dist`).
- `messages.service.ts` `reactionMap` (quanh dòng 1165): sau khi có danh sách `emoji` từ `groupBy`,
  gom các token `c:<id>` và, **chỉ khi có**, chạy một truy vấn
  `customEmoji.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })` (không
  lọc `deletedAt`). Gắn `emojiName` vào từng phần tử tương ứng. Không thêm truy vấn khi trang tin
  không có reaction custom.
- Các chỗ khác trả `MessageReactionDto[]` (`reactionSummary`, dòng quanh 1018 và 1036) phải đi qua
  cùng đường để tên luôn nhất quán.
- Test: GET tin có reaction custom (còn sống rồi đã xóa) trả `emojiName` đúng trong cả hai trạng thái;
  tin chỉ có emoji Unicode không có trường này và không phát sinh truy vấn thêm.
- Cập nhật `docs/api-conventions.md` nếu có mục mô tả DTO reaction.

### Việc 3. Hiển thị pill khi emoji đã xóa (web)

- `apps/web/src/features/messages/components/message-reactions.tsx`:
  - `ReactionEmoji` nhận cả đối tượng reaction thay vì chỉ chuỗi token. Thứ tự hiển thị: ảnh nếu
    resolve được qua `useEmojiMap`; nếu không và có `emojiName` thì chip `:ten:` (cùng kiểu `text-xs`
    mờ như chip trong tin); nếu không có tên thì biểu tượng chung và `aria-label` rõ nghĩa.
  - `reactionLabel` (dùng cho `aria-label`, `title` và tiêu đề dialog) dùng cùng thứ tự: `:ten:` khi
    biết tên, tuyệt đối không dùng `c:<id>`.
  - Thêm khóa i18n mới ở `vi` và `en` cho nhãn "emoji đã xóa", theo cách các chuỗi khác trong
    `messages` đang làm.
- Pill của emoji đã xóa vẫn bấm được để gỡ nếu `me` là true (nhờ Việc 1) và không bấm để thêm khi
  `me` là false: dùng `disabled` hoặc bắt `REACTION_EMOJI_INVALID` ở `onError` để hiện thông báo gọn
  thay vì toast chung khó hiểu. Chọn một cách, ghi vào ADR.
- Test:
  - Unit cho `ReactionEmoji` ba nhánh: resolve được, chỉ có tên, không có gì.
  - Cập nhật `apps/web/e2e/emoji-custom.spec.ts` (dòng khoảng 440–460): pill sau khi xóa phải chứa
    `:test_emoji:` thay cho `c:<8 ký tự>`, không được chứa UUID, và người đã thả bấm vào pill thì pill
    biến mất.

### Việc 4. ADR

- Tạo `docs/adr/0081-reaction-cua-emoji-da-xoa.md` (theo template ADR hiện có): ghi bối cảnh, bốn
  quyết định đầu của mục "Quyết định", phương án đã loại (xóa dây chuyền reaction khi xóa emoji; để
  nguyên `c:<id>`), hệ quả (reaction mồ côi vẫn chiếm slot cho tới khi mọi người gỡ; chưa có thao tác
  "xóa mọi reaction của một emoji" cho người có `MANAGE_MESSAGES`).
- Thêm một dòng vào mục lục ADR trong `docs/README.md` và chạy `node scripts/check-doc-links.mjs`.

### Việc 5 (tùy chọn). Tách CSDL cho e2e

Việc này ngoài phạm vi sửa lỗi nhưng gỡ nguồn gốc dữ liệu rác:

- Cho Playwright chạy với `DATABASE_URL` riêng (ví dụ `ping_e2e`) và không tái dùng server dev khi
  chạy local (`reuseExistingServer: !!process.env.CI` hoặc cờ rõ ràng). Cần kiểm `global-setup.ts`
  và cách migrate CSDL e2e, và cân nhắc ảnh hưởng tới CI (`.github/workflows/ci.yml` đã có service
  Postgres riêng).
- Quyết định này đụng hạ tầng test; làm một ADR hoặc ghi chú trong `CONTRIBUTING.md`, và hỏi chủ dự án
  trước khi đổi cách chạy e2e quen thuộc.
- Dọn dữ liệu hiện có trong playground là việc thủ công của chủ dự án: xóa các tin `:test_emoji:`
  hoặc chạy `pnpm demo:prepare` để dựng lại. Agent **không tự xóa** dữ liệu trong CSDL dev.

## Tiêu chí hoàn thành

- Gỡ reaction bằng emoji đã xóa trả 200 và pill biến mất; thêm bằng emoji đã xóa vẫn 400.
- `GET /channels/:id/messages` trả `emojiName` cho reaction custom, còn sống hay đã xóa.
- Không còn chỗ nào hiển thị `c:<id>` hay UUID trên giao diện; pill mất tên hiện biểu tượng chung.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, e2e API (`emojis`, `reactions`,
  `idor`) và e2e web `emoji-custom` xanh. Không dùng `--no-verify`.
- ADR-0081 có trong `docs/adr/` và mục lục `docs/README.md`; kiểm tra liên kết tài liệu sạch.

## Không làm trong đợt này

- Không xóa dây chuyền reaction khi xóa emoji.
- Không đổi payload sự kiện realtime hay token `c:<id>`.
- Không đụng schema Prisma (không cần migration).
- Không đổi cách hiển thị chip `:ten:` trong nội dung tin (đã đúng thiết kế).

## Nguồn

- [Emoji Resource — Discord Developer Docs](https://docs.discord.com/developers/resources/emoji)
- [Message Resource (reactions) — Discord Developer Docs](https://docs.discord.com/developers/resources/message)
- [Reference: Message Formatting — Discord Developer Docs](https://docs.discord.com/developers/reference)
