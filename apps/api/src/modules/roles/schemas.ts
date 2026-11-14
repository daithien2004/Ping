import { z } from 'zod';

// JSON không có bigint: client gửi string hoặc number; permissions là bitmask 64-bit.
const permissionsSchema = z.coerce.bigint().min(0n);

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: permissionsSchema.optional(),
  position: z.number().int().min(0).max(999).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  permissions: permissionsSchema.optional(),
  position: z.number().int().min(0).max(999).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const assignRolesSchema = z.object({
  roleIds: z.array(z.uuid()).max(64),
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
