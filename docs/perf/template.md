# Báo cáo hiệu năng — <tên> (<YYYY-MM-DD>)

## Môi trường

| Mục                     | Giá trị                                                    |
| ----------------------- | ---------------------------------------------------------- |
| Máy                     | CPU, số nhân/luồng, RAM, hệ điều hành                      |
| Nơi chạy Postgres/Redis | Docker (VM bao nhiêu RAM/CPU) hay máy riêng, phiên bản     |
| Số instance API         | 1 / 2 / 3, cấu hình (`TRUST_PROXY`, pool, mức log)         |
| Phiên bản app           | commit                                                     |
| Công cụ                 | k6 phiên bản, Node phiên bản                               |
| Dữ liệu                 | số user, số channel, số tin, channel nóng có bao nhiêu tin |

## Mục tiêu và kết quả

| Chỉ số                     | Mục tiêu     | Kết quả | Đạt? |
| -------------------------- | ------------ | ------- | ---- |
| Kết nối socket đồng thời   | 5.000–10.000 |         |      |
| Tin nhắn gửi mỗi giây      | 200–500      |         |      |
| REST p95                   | < 200 ms     |         |      |
| Phát tin khác instance p95 | < 500 ms     |         |      |
| Tỉ lệ 5xx                  | < 0,1%       |         |      |

## Số đo chi tiết

Mỗi kịch bản: lệnh đã chạy, bảng số (p50/p95/max, lỗi), nhận xét. Có bảng so sánh 1 / 2 / 3 instance.

## EXPLAIN ANALYZE

Câu lệnh, kế hoạch (index nào), thời gian thực thi.

## Điểm nghẽn tìm thấy

Mỗi điểm: bằng chứng (số đo, log), nguyên nhân gần đúng, đề xuất, mức độ nghiêm trọng.

## Giới hạn của lần đo này

Điều gì khiến con số không đại diện cho production.
