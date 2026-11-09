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

`Omit` khỏi props antd mọi prop quyết định hình thức (`type`, `size`, `danger`, `ghost`, `shape`, `color`, `variant`...) để consumer chỉ còn `variant` và `size` của Ping. Nếu không, người ta sẽ truyền thẳng prop antd và hợp đồng bị thủng. Kết quả typecheck vỡ ở chỗ cũ là chủ ý, phải đếm số chỗ và codemod trong cùng commit.

### 3. Thứ tự spread: `rest` đứng đầu, hợp đồng đứng sau

```tsx
<Button {...rest} {...VARIANTS[variant]} size={...} data-slot="button" data-variant={variant} />
```

`Omit` chỉ chặn ở mức type; ở runtime, thứ đứng sau mới thắng. Skin và test bám vào `data-slot`, `data-variant`, `data-size`, nên chúng phải đứng sau `rest` để không bị đè.

### 4. `size` không có default; `variant` không có default ngầm

- `size?: PingSize`. Chỉ gọi `toAntdSize(size)` khi có giá trị, còn không truyền `undefined` để antd tự lấy từ `ConfigProvider` (prop tên là `componentSize`), `Space.Compact`, `Button.Group`. Ép `'md'` nghĩa là `ConfigProvider` vô hiệu (đã kiểm chứng với antd 6.6.7).
- `variant` bắt buộc truyền. Default ngầm là nơi diện mạo bị đổi mà không ai thấy. Khi chuyển từ default cũ sang bắt buộc, codemod thêm đúng giá trị cũ (vd `variant="primary"`) để không đổi hình.
- Vì `data-size` vắng khi không truyền `size`, **CSS skin không được bám `data-size`**. Cần theo cỡ thì bám class antd (`.ant-btn-lg`, `.ant-btn-sm`) hoặc token.

### 5. `ref` là prop thường, không `forwardRef`

React 19 truyền `ref` qua props. Nếu antd component có nhiều kiểu ref (vd Button vừa là `<button>` vừa là `<a>` khi có `href`), `Omit` các prop gây phân nhánh (`href`, `target`) và `ref`, rồi khai báo lại `ref` kiểu hẹp. Nút điều hướng là wrapper riêng (`PingLinkButton`); chỉ nhắc tên wrapper trong comment khi nó thật sự tồn tại.

### 6. `data-testid` cho ghi đè

Mặc định cố định (`'ping-button'`) chỉ để tương thích; nhiều nút trên một trang thì test không nhắm được. Cho phép truyền testid riêng:

- Wrapper spread props antd (`Omit<ComponentProps<...>>`): viết `data-testid="ping-x"` **trước** `{...props}`; props của chỗ gọi đè được. Không khai báo prop `'data-testid'` (xung đột với index `data-${string}` của antd).
- Wrapper có `data-*` hợp đồng (button, icon-button, link-button): `{...rest}` phải đứng đầu nên destructure `'data-testid': testId = 'ping-x'` và đặt cạnh các `data-*` khác.
- Wrapper có props đóng (không spread, vd table, drawer, popconfirm, password-input, kbd) thì testid cố định theo thiết kế; muốn nhắm riêng thì thêm prop `testId` có chủ đích.

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
- Selector hẹp: icon chọn theo con trực tiếp / `.anticon > svg`, không chọn `svg` hậu duệ sâu (sẽ ăn cả badge, avatar nằm trong nút). Kiểm tra DOM thật của antd trước khi chốt.

### 9. Một nguồn cho cỡ

`components/ui/size.ts` giữ `PingSize` và `toAntdSize`. Mọi wrapper có `size` dùng chung; không wrapper nào tự có `sizeMap` cục bộ, và không cỡ antd (`small|middle|large`) nào lộ ra API công khai của Ping.

### 10. `danger` + `ghost` không kết hợp

Một biến thể = một vẻ. Nếu cần tổ hợp, thêm biến thể mới vào `VARIANTS` chứ không mở prop antd ra lại. Ghi chú điều này trong comment đầu `VARIANTS`.

## Kỷ luật commit (quan trọng)

Tách thay đổi **không đổi hình** khỏi thay đổi **đổi diện mạo**:

- **Commit không đổi hình, cây luôn xanh:** tạo wrapper, `size.ts`, bỏ `forwardRef`, đổi default, codemod giữ giá trị cũ, test ánh xạ hiện trạng. Biến thể mới chưa có luật skin thì **chưa thêm**, vì `data-variant` đã phát ra từ lúc tồn tại; thêm luật CSS sớm sẽ đổi hình ngay.
- **Commit đổi diện mạo:** thêm biến thể mới, đổi ánh xạ (vd ghost `default` → `dashed`), thêm luật skin, CSS icon `1em`, kèm ảnh trước/sau cho các chỗ bị ảnh hưởng.
- Comment luôn đúng với trạng thái code ở **từng** commit. Đừng viết "test sẽ nhắc skin" khi test chưa tồn tại; viết "cần có test nhắc skin" rồi đổi khi test được thêm.
- Test phủ skin chỉ đặt cùng commit với luật skin, nếu không commit trước sẽ đỏ.

## Quy trình thêm một wrapper mới

1. Liệt kê các prop antd quyết định hình thức → sẽ bị `Omit`.
2. Chốt danh sách biến thể và ánh xạ sang props antd (`VARIANTS`).
3. Quyết định `size` có không; nếu có thì dùng `size.ts`.
4. Viết wrapper theo `references/templates.md` (đúng thứ tự spread, `data-slot` riêng cho component này).
5. Viết test theo `references/tests.md`.
6. Cập nhật skin theo `data-slot`/`data-variant`; kiểm tra mọi skin.
7. Chạy typecheck, đếm chỗ gọi vỡ, codemod nếu cần.
8. Chia commit theo kỷ luật ở trên.

## Checklist review (dùng khi xem PR)

- [ ] Kiểu biến thể suy ra từ `VARIANTS`, không có union song song.
- [ ] Props hình thức của antd đã `Omit`; `ref` khai báo lại nếu cần.
- [ ] `{...rest}` đứng trước `data-*` hợp đồng.
- [ ] `size` không bị ép default; `toAntdSize` chỉ gọi khi có giá trị.
- [ ] Không CSS nào bám `data-size` hoặc `.ant-*` nội bộ cho việc phân biệt biến thể.
- [ ] Mọi biến thể (trừ những cái cố ý rơi về secondary, có test ghi nhận) có luật ở từng skin.
- [ ] CSS dùng chung trong `@layer components`, selector hẹp.
- [ ] Comment khớp trạng thái code; không nhắc component chưa tồn tại.
- [ ] Commit đổi hình tách riêng, có ảnh trước/sau.
- [ ] Đã nói rõ phần nào chưa chạy/chưa xác minh.
