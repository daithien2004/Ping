import { z } from 'zod';

/**
 * Adapter từ schema zod của `packages/shared` sang luật validate của `PingForm`.
 *
 * Luật được mô tả theo **cấu trúc** chứ không import antd ở đây: chỉ `components/ui/` được
 * import antd (ADR-0050). Kiểu `PingFormRule` tương thích với `Rule` của antd — validator
 * nhận `(rule, value)` và ném lỗi (promise bị reject) khi giá trị không hợp lệ.
 */
export interface PingFormRule {
  validator: (rule: unknown, value: unknown) => Promise<void>;
}

/** Map: tên field → danh sách luật validate. */
export type PingFormRules = Record<string, PingFormRule[]>;

/** Tên các field của schema `z.object` (rỗng nếu schema không phải object). */
export function zodFieldNames(schema: z.ZodType): string[] {
  const shape = (schema as { shape?: unknown }).shape;
  return shape && typeof shape === 'object' ? Object.keys(shape) : [];
}

/**
 * Dựng luật validate cho từng field của một schema zod (`z.object`).
 *
 * `getValues` trả về giá trị hiện tại của **cả form**: validator parse lại toàn bộ object nên
 * luật ràng buộc giữa các field (`refine`, `superRefine`) cũng được áp dụng, không chỉ field
 * đang kiểm tra. Nhờ vậy web và API dùng chung **một** bộ luật — không viết lại luật kiểm tra.
 */
export function zodFormRules(
  schema: z.ZodType,
  getValues: () => Record<string, unknown>,
): PingFormRules {
  const rules: PingFormRules = {};
  for (const field of zodFieldNames(schema)) {
    rules[field] = [
      {
        validator: async () => {
          const result = schema.safeParse(getValues());
          if (result.success) return;
          const issue = result.error.issues.find(
            (item) => item.path.length === 0 || item.path[0] === field,
          );
          if (issue) throw new Error(issue.message);
        },
      },
    ];
  }
  return rules;
}

/** Lỗi đầu tiên của một field (dùng khi cần hiển thị ngoài `PingForm`). */
export function zodFieldErrors(
  schema: z.ZodType,
  values: Record<string, unknown>,
): Record<string, string[]> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (!field) continue;
    errors[field] = [...(errors[field] ?? []), issue.message];
  }
  return errors;
}
