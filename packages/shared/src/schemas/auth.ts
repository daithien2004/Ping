import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().max(254),
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
  email: z.email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
