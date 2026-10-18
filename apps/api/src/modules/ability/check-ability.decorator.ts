import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actions, AppAbility, Subjects } from '@ping/shared';

export const CHECK_ABILITY_KEY = 'check_ability';

/**
 * Kiểm tra theo LOẠI ở tầng guard (guide 10.2): `@CheckAbility(['create', 'Message'])`.
 * Kiểm tra theo ĐỐI TƯỢNG (vd. có phải tác giả tin hay không) nằm ở service qua
 * `ForbiddenError.from(ability).throwUnlessCan(action, subject('Message', message))`.
 */
export const CheckAbility = (required: [Actions, Subjects]) =>
  SetMetadata(CHECK_ABILITY_KEY, required);

/** Lấy ability mà AbilityGuard đã dựng và gắn vào request. */
export const CurrentAbility = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppAbility =>
    ctx.switchToHttp().getRequest<{ ability: AppAbility }>().ability,
);
