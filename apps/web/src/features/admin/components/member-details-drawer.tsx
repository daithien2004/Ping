'use client';

import type { MemberDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingDrawer } from '@/components/ui/ping-drawer';
import { RoleTag } from './role-tag';

interface Props {
  member: MemberDto | null;
  onClose: () => void;
}

/**
 * Chi tiết một thành viên: vai trò (màu theo vai trò), ngày vào và trạng thái.
 * Dùng `PingDrawer` để không rời khỏi trang cài đặt.
 */
export function MemberDetailsDrawer({ member, onClose }: Props) {
  const t = useTranslations('admin');
  const tm = useTranslations('members');
  const name = member ? (member.nickname ?? member.user.displayName) : '';

  return (
    <PingDrawer open={member !== null} onClose={onClose} title={t('memberDetails')}>
      {member && (
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('memberName')}</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('memberUsername')}</dt>
            <dd>@{member.user.username}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('memberRoles')}</dt>
            <dd className="flex flex-wrap gap-1">
              {member.roles.length === 0 ? (
                <span className="text-muted-foreground">{t('noRoles')}</span>
              ) : (
                member.roles.map(({ role }, index) => (
                  <RoleTag key={role.id} name={role.name} position={index} />
                ))
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('memberStatus')}</dt>
            <dd>{member.online ? tm('statusOnline') : tm('statusOffline')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('memberJoinedAt')}</dt>
            <dd>{new Date(member.joinedAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      )}
    </PingDrawer>
  );
}
