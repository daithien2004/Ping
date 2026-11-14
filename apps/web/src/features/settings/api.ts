import {
  updateUserSettingsSchema,
  type UpdateUserSettingsInput,
  type UserSettingsDto,
} from '@ping/shared';
import { z } from 'zod';
import { api } from '@/lib/api-client';

const userSettingsSchema: z.ZodType<UserSettingsDto> = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  density: z.enum(['comfortable', 'compact']),
  fontSize: z.enum(['sm', 'md', 'lg']),
  locale: z.enum(['vi', 'en']),
});

export const getSettings = (): Promise<UserSettingsDto> =>
  api.get<UserSettingsDto>('/users/me/settings', userSettingsSchema);

export const patchSettings = (input: UpdateUserSettingsInput): Promise<UserSettingsDto> =>
  api.patch<UserSettingsDto>(
    '/users/me/settings',
    updateUserSettingsSchema.parse(input),
    userSettingsSchema,
  );
