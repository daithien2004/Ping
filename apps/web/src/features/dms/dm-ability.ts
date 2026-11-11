import { createMongoAbility } from '@casl/ability';
import { defineDmAbilityFor, type AppAbility } from '@ping/shared';

/**
 * Quyền của participant trong một DM (TG.9, ADR-0070). Luật gốc định nghĩa MỘT NƠI ở
 * `defineDmAbilityFor` (packages/shared); ở đây chỉ rút bớt khi biết là đang bị chặn.
 *
 * Bị chặn (mình vừa chặn, hoặc gặp 403 `DM_BLOCKED` khi gửi) thì bỏ rule `create Message` để
 * composer tự về trạng thái không gửi được qua đúng luồng ability có sẵn; vẫn đọc được tin cũ
 * (mục 4 của ADR).
 */
export function dmAbilityFor(meId: string, blocked: boolean): AppAbility {
  const ability = defineDmAbilityFor(meId);
  if (!blocked) return ability;
  return createMongoAbility<AppAbility>(
    ability.rules.filter((rule) => !(rule.action === 'create' && rule.subject === 'Message')),
  );
}
