import { z } from 'zod';

// Email không phân biệt hoa/thường: chuẩn hóa TRƯỚC khi validate (zod 4 chạy
// .trim() sau check định dạng nếu viết z.email().trim()).
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  email: emailSchema,
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_.-]+$/i, 'chỉ dùng chữ, số, _ . -'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
