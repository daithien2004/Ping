import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actions, AppAbility, Subjects } from '@ping/shared';

export const CHECK_ABILITY_KEY = 'check_ability';

export const CheckAbility = (required: [Actions, Subjects]) =>
  SetMetadata(CHECK_ABILITY_KEY, required);

export const CurrentAbility = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppAbility =>
    ctx.switchToHttp().getRequest<{ ability: AppAbility }>().ability,
);
