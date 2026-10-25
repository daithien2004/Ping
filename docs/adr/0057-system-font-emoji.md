# ADR-0057: Nguồn hình emoji — font hệ thống

Status: accepted — OWNER duyệt kèm kế hoạch TG.23 trong phiên ngày 2026-10-25
Date: 2026-10-25

## Context

TG.23 cần emoji picker đầy đủ (nhóm, tìm kiếm vi/en, gần đây, tông da) và hiển thị emoji trong
tin nhắn. Có hai nguồn hình: font hệ thống của máy người dùng, hoặc bộ ảnh tự chủ (Twemoji,
Noto Emoji, OpenMoji…). Ràng buộc: ngân sách bundle ban đầu ≤ 450 KB (ADR-0058), không thêm
tài sản thiếu giấy phép (TG.22 note), desktop-only.

## Decision

**Dùng font hệ thống** — emoji render bằng ký tự Unicode do OS cung cấp (Segoe UI Emoji trên
Windows, Apple Color Emoji trên macOS, Noto Color Emoji trên Linux/Android).

Lý so: (1) bundle **0 KB** — bộ ảnh Noto màu ~10–25 MB (hoặc subset per-emoji hàng trăm KB)
làm phình ngân sách và thời gian tải lần đầu; (2) **không vướng giấy phép** — Twemoji là CC-BY
(cần attribution), Noto là OFL/Apache — đều phải thêm `ASSETS_LICENSES.md` và pipeline tài sản
mà TG.22 (sticker) mới thực sự cần; (3) desktop Chrome hiện đại render emoji màu đầy đủ; (4)
dữ liệu picker (tên, từ khóa, nhóm) là chuỗi nhỏ (~25 KB gzip) và đã lazy-load.

Trade-off được chấp nhận: hình emoji khác nhau giữa các OS (kích thước/màu sắc không đồng
nhất); một số emoji rất mới có thể hiển thị ô vuông trên OS cũ — chấp nhận cho desktop pilot,
ghi chú để người pilot biết.

## Alternatives

- Twemoji (CC-BY 4.0): hình đồng nhất mọi nền tảng, nhưng +hàng trăm KB tài sản, phải lưu
  attribution, và render ảnh thay text (a11y/serif kém hơn trên chat).
- Noto Emoji (OFL): tương tự về khối lượng.
- OpenMoji: giấy phép CC BY-SA — truyền nhiễm giấy phép vào nội dung người dùng, rủi ro.

## Consequences

- Picker và render không tải tài sản nào; emoji lớn (tin chỉ toàn emoji) chỉ là chữ lớn hơn.
- Shortcode → Unicode map (TG.4) và dataset picker dùng chung một nguồn dữ liệu để không lệch.
- Nếu sau này cần đồng bộ hình ảnh (thương hiệu/screenshot demo), viết ADR mới về subset
  tài sản + `ASSETS_LICENSES.md`.
