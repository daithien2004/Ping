---
name: ping-wrapper
description: Quy ước tạo, sửa và review wrapper component Ping (PingButton, PingIconButton, PingInput, PingSelect...) bọc quanh antd trong components/ui của dự án. Bắt buộc dùng skill này khi người dùng nhắc tới wrapper, "bọc antd", component Ping*, thêm biến thể (variant) hoặc cỡ (size) cho component UI, skin/theme Pop, data-variant/data-slot, hay muốn tạo component mới trong components/ui, kể cả khi họ không nói chữ "wrapper". Cũng dùng khi review PR có đụng tới components/ui hoặc CSS skin.
---

# Wrapper component Ping (bọc antd)

Mục tiêu của wrapper: **một hợp đồng hình thức duy nhất** giữa code ứng dụng và antd. Code ứng dụng chỉ nói "nút này là `danger`, cỡ `sm`"; wrapper quyết định antd nhận props gì; skin CSS bám vào hợp đồng đó chứ không bám vào class nội bộ của antd. Mọi quy tắc dưới đây phục vụ ba việc: thêm biến thể rẻ, đổi skin không vỡ, và không để ai âm thầm vòng qua hợp đồng.

Mẫu code đầy đủ ở `references/templates.md`. Cách viết test ở `references/tests.md`. Đọc khi cần, không cần nạp cả hai mọi lúc.

## Trước khi viết

1. **Đối chiếu docs antd đúng phiên bản đang cài** trước khi dùng prop nào (vd `type`, `danger`, `color`, `variant` đổi nghĩa giữa các bản). Đừng dựa vào trí nhớ. Xem `package.json` và theo CLAUDE.md của repo.
2. Kiểm tra `components/ui/` xem đã có `size.ts` và wrapper tương tự chưa; tái dùng, không nhân đôi.
3. Nếu chưa chạy được thì nói rõ "chưa chạy typecheck/test", đừng khẳng định đã ổn.

## Quy tắc cốt lõi

### 1. Một bảng hợp đồng, kiểu suy ra từ bảng

Ánh xạ biến thể Ping → props antd nằm trong một object `VARIANTS`. Kiểu biến thể là `keyof typeof VARIANTS`, không khai báo union riêng. Lý do: khai báo kép nghĩa là thêm biến thể phải sửa hai nơi, và `satisfies` chỉ bắt thiếu chứ không làm hai nơi thành một. Dùng `as const satisfies Record<string, Pick<AntdXProps, ...>>`.

### 2. Props hình thức thuộc về wrapper

`Omit` khỏi props antd mọi prop quyết định hình thức (`type`, `size`, `danger`, `ghost`, `shape`, `color`, `variant`...) để consumer chỉ còn `variant` và `size` của Ping. Nếu không, người ta sẽ truyền thẳng prop antd và hợp đồng bị thủng. Kết quả typecheck vỡ ở chỗ cũ là chủ ý, phải đếm số chỗ và codemod ngay trong lượt thay đổi đó.

**API mở hay đóng.** Chọn một trong hai, theo tiêu chí:

- **Mở** (`Omit` prop hình thức + spread): antd component chủ yếu là prop hành vi, ít xung đột ngữ nghĩa với Ping (Alert, Modal, Tabs).
- **Đóng** (`Pick` + spread): có prop trùng tên nhưng khác nghĩa (`size` của Drawer là bề rộng, không phải `PingSize`), hoặc nhiều prop hình thức dễ lọt (Drawer, Popconfirm). Không liệt kê rồi chuyển tiếp từng prop; chỉ cần
  ```tsx
  export type PingDrawerProps = Pick<DrawerProps, 'open' | 'onClose' | ...> & { size?: number | string };
  export function PingDrawer(props: PingDrawerProps) { return <Drawer data-testid="ping-drawer" {...props} />; }
  ```
  Thêm prop mới chỉ sửa danh sách `Pick`.
- Wrapper đóng đặt trong `Form.Item` (ô nhập, chọn...) phải giữ trong `Pick` các prop mà form đưa vào: `value`, `onChange`, `id`, `aria-invalid`, `aria-describedby`. Thiếu thì ô mất liên kết với form mà typecheck chưa chắc báo.
- Wrapper cùng họ (`PingInput`, `PingPasswordInput`, `PingTextArea`...) phải có cùng bộ prop hình thức, đặc biệt `size?: PingSize`; thiếu thì hai ô cạnh nhau không đồng cỡ được.
- Không dùng `as unknown as ...` để vượt lỗi kiểu khi spread props: nó tắt kiểm tra mọi prop. Tìm prop gây lỗi (vd `children` dạng hàm render của `Form`) rồi `Omit` và khai báo lại hẹp.
- `type PingXProps = AntdXProps` (alias trần) mở cả prop `size` kiểu antd mà `size.test.ts` không bắt được (nó chỉ quét chuỗi `size?: 'small'...`). Wrapper alias antd phải `Omit` `size`; khóa bằng ca trong `closed-api.test.ts`.
- Wrapper giữ singleton bên ngoài React (vd `pingToast`): chỉ cleanup khi instance vẫn là của mình (`if (api === instance)`), và gọi khi chưa có host phải cảnh báo ở dev, không nuốt im lặng. Đọc cờ môi trường qua `@/lib/env` (lint chặn `process.env`).
- Wrapper có dữ liệu dạng cột/field (`PingTable`): bắt `key` bằng kiểu, không dùng `string` trần. Cột không có `render` thì `key: Extract<keyof T, string>`, có `render` thì `key: string`. Chỗ gọi phải gõ rõ `PingTableColumn<Row>[]` (nếu để `Record<string, unknown>` hoặc `any` thì kiểm tra mất tác dụng mà không báo). Field lồng (`'user.name'`) không biểu diễn được: chuyển sang `render`.
- "Đóng" chỉ ở mức kiểu: spread một object kiểu rộng vẫn đẩy prop thừa xuống antd lúc chạy. Khóa bằng `closed-api.test.ts` (`// @ts-expect-error` khi truyền `placement`/`styles`); chỉ có tác dụng vì test nằm trong phạm vi `tsc`. Wrapper đóng mới thì thêm một ca vào file đó.
- Wrapper generic (`PingTable<T>`) xem riêng: `ComponentProps<typeof Table>` làm mất generic, `Pick<TableProps<T>, ...>` đòi hàm cũng generic. Đừng áp mẫu máy móc.

### 3. Thứ tự spread: `rest` đứng đầu, hợp đồng đứng sau

```tsx
<Button {...rest} {...VARIANTS[variant]} size={...} data-slot="button" data-variant={variant} />
```

`Omit` chỉ chặn ở mức type; ở runtime, thứ đứng sau mới thắng. Skin và test bám vào `data-slot`, `data-variant`, `data-size`, nên chúng phải đứng sau `rest` để không bị đè.

Áp dụng cho **mọi** wrapper có `data-slot`, kể cả loại chỉ spread `props`. `Omit` không chặn được `data-slot` vì antd có index `data-${string}`, nên chỗ gọi truyền được mà typecheck không báo; nếu `data-slot` đứng trước `rest`, phần tử rời khỏi mọi luật skin mà không có lỗi nào. Chỉ `data-testid` được đứng trước (xem quy tắc 6). `wrapper-contract.test.ts` kiểm thứ tự này.

### 4. `size` không có default; `variant` không có default ngầm

- `size?: PingSize`. Chỉ gọi `toAntdSize(size)` khi có giá trị, còn không truyền `undefined` để antd tự lấy từ `ConfigProvider` (prop tên là `componentSize`), `Space.Compact`, `Button.Group`. Ép `'md'` nghĩa là `ConfigProvider` vô hiệu (đã kiểm chứng với antd 6.6.7).
- `variant` bắt buộc truyền. Default ngầm là nơi diện mạo bị đổi mà không ai thấy. Khi chuyển từ default cũ sang bắt buộc, codemod thêm đúng giá trị cũ (vd `variant="primary"`) để không đổi hình.
- Vì `data-size` vắng khi không truyền `size`, **CSS skin không được bám `data-size`**. Cần theo cỡ thì bám class antd (`.ant-btn-lg`, `.ant-btn-sm`) hoặc token.

### 5. `ref` là prop thường, không `forwardRef`

React 19 truyền `ref` qua props. Nếu antd component có nhiều kiểu ref (vd Button vừa là `<button>` vừa là `<a>` khi có `href`), `Omit` các prop gây phân nhánh (`href`, `target`) và `ref`, rồi khai báo lại `ref` kiểu hẹp. Nút điều hướng là wrapper riêng (`PingLinkButton`); chỉ nhắc tên wrapper trong comment khi nó thật sự tồn tại.

**Wrapper điều hướng (`PingLinkButton`).** Tách riêng vì `<a>` và `<button>` khác thẻ, kiểu `ref` và hành vi; props dẫn xuất từ `PingButtonProps` (`Omit` thêm `htmlType`, `loading`, `ref`; `href` bắt buộc).

- Antd render `<a href>`, ta chỉ bắt click bấm trái thuần để gọi `router.push`; phím phụ và chuột giữa để trình duyệt xử lý. Hàm bắt click là hàm thuần, export và có unit test (`ping-link-button.test.ts`: `button`, `meta/ctrl/shift/alt`).
- Không bọc `<Link><PingButton/></Link>` (`<a><button>` là HTML sai); antd `Button` không có `as`/`component` để đổi thẻ.
- Giới hạn đã biết: **không prefetch**. Chấp nhận cho 404 và trang lỗi; dùng cho điều hướng thường xuyên thì xét lại (`<Link>` kèm class nút hoặc `router.prefetch`). Mọi giới hạn kiểu này phải ghi trong comment đầu wrapper kèm điều kiện xét lại.
- Nút `disabled` có `href`: antd 6.6.7 tự `preventDefault` và không chạy `onClick`; kiểm lại khi nâng antd.

### 6. `data-testid` cho ghi đè

Mặc định cố định (`'ping-button'`) chỉ để tương thích; nhiều nút trên một trang thì test không nhắm được. Cho phép truyền testid riêng:

- Wrapper spread props antd (`Omit<ComponentProps<...>>`): viết `data-testid="ping-x"` **trước** `{...props}`; props của chỗ gọi đè được. Không khai báo prop `'data-testid'` (xung đột với index `data-${string}` của antd).
- Wrapper có `data-*` hợp đồng (button, link-button): `{...rest}` phải đứng đầu nên destructure `'data-testid': testId = 'ping-x'` và đặt cạnh các `data-*` khác.
- Wrapper đóng bằng `Pick` + `{...props}` (drawer, popconfirm): `data-testid` viết trước `{...props}`, ghi đè được ở runtime; JSX viết trực tiếp `data-*` không bị TypeScript kiểm.
- Wrapper không bọc antd hoặc có logic riêng (kbd, table, password-input): testid cố định; muốn nhắm riêng thì thêm prop `testId` có chủ đích.

### 7. `className` truyền thẳng khi wrapper không có class mặc định

Không dùng `cn` nếu không có gì để gộp. Nếu sau này wrapper thêm class mặc định thì phải quay lại `cn`, và ghi chú điều này trong comment đầu file để người sau không quên.

### 8. Skin bám hợp đồng, không bám nội bộ antd

```css
/* đúng */
html[data-skin='pop'] [data-slot='button'][data-variant='danger']:not(:disabled) { ... }
/* sai: ăn cả nút không phải Ping, vỡ khi antd đổi class */
html[data-skin='pop'] .ant-btn-dangerous { ... }
```

- Biến thể chỉ khác nhau nhờ CSS (vd `success`, `info` cùng ánh xạ `default`) mà skin quên định nghĩa sẽ **âm thầm rơi về secondary**. Phải có test duyệt `Object.keys(VARIANTS)` và kiểm tra từng skin có luật.
- CSS dùng chung (vd icon `1em`) đặt trong `@layer components` để utility Tailwind của người gọi (`size-5`) vẫn thắng. CSS ngoài layer luôn thắng utility bất kể độ đặc hiệu.
- Slot là chuỗi **literal** (`data-slot="avatar"`), không dựng động (`data-slot={`${x}-item`}`): test hợp đồng grep nguồn nên mù với slot động. Slot mới phải vào bảng ở đầu `skin-pop.css`.
- Ngoại lệ portal chỉ áp cho phần tử **antd tự dựng** (khung modal, tooltip, dropdown, toast, nút OK/Cancel mặc định): bám `.ant-*`. Nội dung Ping tự đặt vào portal (vd `PingButton` trong footer modal) vẫn mang slot nên vẫn khớp luật slot. Muốn nút OK/Cancel mặc định giống `PingButton`, truyền `okButtonProps`/`cancelButtonProps` có `data-slot` thay vì thêm luật `.ant-*`.
- Selector hẹp: icon chọn theo con trực tiếp (antd 6.6.7: `> .ant-btn-icon > svg`; icon loading là `.anticon > svg`), không chọn `svg` hậu duệ sâu (sẽ ăn cả badge, avatar nằm trong nút). Kiểm tra DOM thật của antd trước khi chốt.

### 9. Một nguồn cho cỡ

`components/ui/size.ts` giữ `PingSize` và `toAntdSize`. Mọi wrapper có `size` dùng chung; không wrapper nào tự có `sizeMap` cục bộ, và không cỡ antd (`small|middle|large`) nào lộ ra API công khai của Ping.

### 10. Màu và kích thước phụ kiện đi qua token và tỉ lệ

- Màu của phần tử wrapper tự vẽ (chấm presence, viền...) dùng **class Tailwind trỏ token** (`bg-online`, `border-background`, `bg-muted`), viết đủ chuỗi literal để Tailwind nhận (bảng ánh xạ `{ online: 'bg-online' }`, không ghép `` `bg-${x}` ``). Không inline `style={{ background: 'var(--x)' }}`: inline thắng CSS skin nên skin phải `!important`.
- Không bịa họ biến CSS riêng (`--ping-color-*`): biến không được định nghĩa thì trình duyệt bỏ khai báo âm thầm (từng làm `PingKbd` mất viền, nền, màu). Trước khi dùng một `var(--x)`, grep nó trong `tokens.generated.css`/`globals.css`. `wrapper-contract.test.ts` chặn `var(--ping-`.
- Phụ kiện gắn vào thành phần có `size` (chấm, badge, icon) co giãn theo **tỉ lệ của phần tử cha** (`w-[30%] aspect-square min-w-2`), không px cố định: cỡ có thể đến từ `ConfigProvider` mà wrapper không biết. Chỗ gọi truyền số thì tỉ lệ vẫn đúng.
- Wrapper không dùng i18n. Chữ cho trình đọc màn hình (`aria-label`) phải do chỗ gọi truyền vào bằng prop **bắt buộc theo kiểu** (union: `{ presence?: undefined } | { presence: P; presenceLabel: string }`), không gắn chuỗi tiếng Anh cố định.
- Bọc ngoài cần định vị dùng `inline-flex`, không `inline-block` (tránh khoảng trống baseline dưới phần tử).

### 11. Không re-export hằng số hay kiểu của antd

Chỗ gọi cần một lựa chọn hình thức của antd (vd ảnh `Empty.PRESENTED_IMAGE_SIMPLE`) thì biểu diễn bằng **prop có tên của Ping** (`compact?: boolean`), wrapper tự ánh xạ sang giá trị antd. Đừng `export const PING_X = Antd.X` để chỗ gọi tự truyền: nó lộ chi tiết antd, mở lại prop đã định `Omit` (`image`), và đổi ảnh phải sửa mọi chỗ gọi. Prop hình thức bị thay bằng prop tên thì `Omit` prop gốc (`Omit<EmptyProps, 'image'>`). Giá trị mặc định khi không truyền phải là hình hiện tại của antd để chỗ gọi cũ không đổi hình.

### 12. Wrapper dựa trên wrapper

Wrapper chỉ cố định một biến thể và siết nội dung (vd `PingIconButton` = `PingButton variant="text"` + `icon` + `aria-label` bắt buộc + không `children`) thì **gọi wrapper gốc**, không gọi lại antd:

```tsx
export type PingIconButtonProps = Omit<PingButtonProps, 'variant' | 'children'> & {
  icon: ReactNode;
  'aria-label': string;
};
export function PingIconButton(props: PingIconButtonProps) {
  return <PingButton data-testid="ping-icon-button" {...props} variant="text" />;
}
```

- Props dẫn xuất bằng `Omit<PingXProps, ...>` (như `PingLinkButton`), không chép lại danh sách `Omit` của antd: hai danh sách sẽ lệch khi wrapper gốc loại thêm prop.
- `data-testid` riêng viết trước `{...props}`; biến thể cố định viết **sau** để chỗ gọi không đè.
- Wrapper con không đặt `data-slot` riêng; skin bám slot và biến thể của wrapper gốc. Cần kiểu riêng cho wrapper con thì thêm biến thể vào `VARIANTS` (vd `text`), không mở slot mới khi chưa có luật skin nào dùng.
- Vẫn giữ wrapper con nếu nó thêm bảo đảm ở mức kiểu mà wrapper gốc không có (vd `aria-label` bắt buộc); khóa bằng ca trong `closed-api.test.ts`. Chỉ xóa khi nó không còn thêm gì.
- Biến thể "kiểu antd gốc" (`text`) không cần luật skin: ghi vào danh sách `NATIVE_LOOK_IN_SKINS` của `ping-button.test.ts`.

### 13. `danger` + `ghost` không kết hợp

Một biến thể = một vẻ. Nếu cần tổ hợp, thêm biến thể mới vào `VARIANTS` chứ không mở prop antd ra lại. Ghi chú điều này trong comment đầu `VARIANTS`.

## Hợp đồng `data-*` và skin (tóm tắt)

- `data-slot` = loại thành phần, `data-variant` = biến thể từ `VARIANTS`, `data-size` = chỉ có khi truyền `size` (skin không được bám). Skin bám các nhãn này thay cho `.ant-*` nên không ăn nhầm nút của modal/popconfirm và không vỡ khi antd đổi class.
- Ba thuộc tính đứng **sau** `rest` (quy tắc 3); `data-testid` theo quy tắc 6.
- Slot là chuỗi literal. Ba kiểm tra của `skin-pop-slots.test.ts`: mọi `[data-slot='x']` trong CSS có trong một component; có trong bảng đầu `skin-pop.css`; CSS không có hex thô. Thêm: không có `data-slot={...}` động. Chiều ngược lại (biến thể trong `VARIANTS` có luật skin hoặc nằm trong danh sách cố ý rơi về secondary) do test của từng wrapper, vd `ping-button.test.ts`.
- Ngoại lệ portal: xem quy tắc 8.

## Quy trình thêm một wrapper mới

1. Liệt kê các prop antd quyết định hình thức → sẽ bị `Omit`.
2. Chốt danh sách biến thể và ánh xạ sang props antd (`VARIANTS`).
3. Quyết định `size` có không; nếu có thì dùng `size.ts`.
4. Viết wrapper theo `references/templates.md` (đúng thứ tự spread, `data-slot` riêng cho component này).
5. Viết test theo `references/tests.md`.
6. Cập nhật skin theo `data-slot`/`data-variant`; kiểm tra mọi skin.
7. Chạy typecheck, đếm chỗ gọi vỡ, codemod nếu cần.

## Checklist review (dùng khi xem PR)

- [ ] Kiểu biến thể suy ra từ `VARIANTS`, không có union song song.
- [ ] Props hình thức của antd đã `Omit`; `ref` khai báo lại nếu cần.
- [ ] `{...rest}` đứng trước `data-slot`/`data-variant`/`data-size` (mọi wrapper, không riêng nút); `data-testid` đứng theo quy tắc 6.
- [ ] Wrapper chỉ cố định biến thể gọi wrapper gốc, props dẫn xuất bằng `Omit<PingXProps, ...>`.
- [ ] Không có `export const ... = Antd.X`; lựa chọn hình thức của antd đi qua prop tên của Ping.
- [ ] API mở (`Omit`) hay đóng (`Pick`) đúng tiêu chí; wrapper đóng có ca trong `closed-api.test.ts`.
- [ ] Slot là chuỗi literal, có trong bảng đầu `skin-pop.css`.
- [ ] Màu qua class token, không inline `var()`, không biến lạ; phụ kiện co giãn theo tỉ lệ; chữ cho trình đọc do chỗ gọi truyền.
- [ ] `size` không bị ép default; `toAntdSize` chỉ gọi khi có giá trị.
- [ ] Không CSS nào bám `data-size` hoặc `.ant-*` nội bộ cho việc phân biệt biến thể.
- [ ] Mọi biến thể (trừ những cái cố ý rơi về secondary, có test ghi nhận) có luật ở từng skin.
- [ ] CSS dùng chung trong `@layer components`, selector hẹp.
- [ ] Comment khớp trạng thái code; không nhắc component chưa tồn tại.
- [ ] Thay đổi đổi hình có ảnh trước/sau.
- [ ] Đã nói rõ phần nào chưa chạy/chưa xác minh.
