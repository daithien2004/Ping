/**
 * Helper lexorank cấp API cho TG.10 — CHỈ dùng nội bộ API (không đưa vào @ping/shared:
 * web tự tính rank bằng `rankBetween`, API chỉ cần gán lại khi cạn khoảng).
 *
 * Nguồn rank là packages/shared/src/lexorank.ts (so sánh chuỗi 'a'..'z', 'a' < 'aa').
 */
import { rankBetween } from '@ping/shared';

/**
 * Gán rank CÁCH ĐỀU cho `count` phần tử theo mảng thứ tự mới (rebalance): dùng khi
 * `rankBetween` trả null — hai mốc đã dính sát nhau, không còn chuỗi nào chen giữa.
 *
 * Các rank nằm BÊN TRONG bảng chữ cái (không dùng 'a'/'z' làm đầu mút) để lần chèn sau
 * luôn còn chỗ ở cả hai phía: phần tử `i` nhận số thứ tự floor((i+1)·total/(count+1)) đổi
 * ra cơ số 26 bằng chữ 'a'..'z'. Số ký tự chọn đủ chứa (count + 1) khoảng — với trần
 * 50 category / 200 channel mỗi server (shared/limits.ts) tối đa 2 ký tự (26² = 676 khoảng).
 * Ví dụ: count=1 → 'n'; count=3 → 'g','n','t'.
 */
export function assignRanks(count: number): string[] {
  if (count <= 0) return [];
  let digits = 1;
  let total = 26; // số khoảng khả dụng với số ký tự hiện tại
  while (total < count + 1) {
    digits += 1;
    total *= 26;
  }
  const ranks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let index = Math.floor(((i + 1) * total) / (count + 1));
    let rank = '';
    for (let d = 0; d < digits; d += 1) {
      rank = String.fromCharCode(97 + (index % 26)) + rank;
      index = Math.floor(index / 26);
    }
    ranks.push(rank);
  }
  return ranks;
}

/**
 * So sánh hai rank theo chuỗi (thứ tự lexorank). Dùng khi sắp kênh trong category ở tầng
 * service thay vì ORDER BY của Postgres: collation DB tùy cấu hình, còn lexorank quy ước
 * so sánh theo mã ký tự — sắp trong JS để mọi môi trường cho cùng kết quả.
 */
export function compareRanks(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Rank để NỐI CUỐI sau mốc `prev` (undefined = danh sách trống): trả null khi mốc trước đã
 * cạn khoảng — caller rebalance bằng `assignRanks` cho cả nhóm.
 */
export function rankAfter(prev: string | undefined): string | null {
  return rankBetween(prev, undefined);
}
