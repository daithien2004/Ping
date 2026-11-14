'use client';

import { useTranslations } from 'use-intl';
import { PingCheckbox } from '@/components/ui/ping-checkbox';
import { permissionGroups } from '../permissions';

interface Props {
  value: bigint;
  onChange: (next: bigint) => void;
  disabled?: boolean;
}

export function PermissionGroupEditor({ value, onChange, disabled = false }: Props) {
  const t = useTranslations('admin.permissions');
  const tg = useTranslations('admin.permissionGroups');

  function toggle(bit: bigint, checked: boolean) {
    onChange(checked ? value | bit : value & ~bit);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {permissionGroups.map((group) => (
        <fieldset key={group.labelKey} className="rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground uppercase">
            {tg(group.labelKey)}
          </legend>
          <div className="flex flex-col gap-2">
            {group.options.map((option) => {
              const checked = (value & option.bit) === option.bit;
              return (
                <PingCheckbox
                  key={option.labelKey}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(option.bit, event.target.checked)}
                >
                  {t(option.labelKey)}
                </PingCheckbox>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
