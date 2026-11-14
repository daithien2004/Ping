import type { NotifyLevel } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingSegmented } from '@/components/ui/ping-segmented';

const LEVELS = ['all', 'mentions', 'none'] as const;

export function LevelControl({
  value,
  onChange,
  testIdPrefix,
  disabled,
}: {
  value: NotifyLevel;
  onChange: (level: NotifyLevel) => void;
  testIdPrefix: string;
  disabled?: boolean;
}) {
  const t = useTranslations('notifications');
  const labels = { all: t('levelAll'), mentions: t('levelMentions'), none: t('levelNone') };
  return (
    <PingSegmented
      aria-label={t('levelLabel')}
      disabled={disabled}
      value={value}
      options={LEVELS.map((level) => ({
        value: level,
        label: <span data-testid={`${testIdPrefix}-${level}`}>{labels[level]}</span>,
      }))}
      onChange={(next) => onChange(next as NotifyLevel)}
    />
  );
}
