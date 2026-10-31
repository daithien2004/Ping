'use client';

import type { ChannelCategoryDto } from '@ping/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { CategoryNameDialog } from '@/features/channels/components/category-name-dialog';
import {
  useCategories,
  useChannels,
  useDeleteCategory,
  useReorderCategories,
} from '@/features/channels/hooks';
import { reorderedCategoryIds, sortCategories } from '@/features/channels/sidebar-model';
import { useErrorMessage } from '@/lib/error-message';

/**
 * TG.10: quản lý category của server — tạo/đổi tên/xoá và đổi thứ tự bằng nút lên/xuống
 * (cùng API PUT /categories/reorder với kéo thả ngoài sidebar). Xoá category chỉ đưa kênh
 * về vùng mặc định, không xoá kênh nào (mô tả nói rõ để người dùng yên tâm).
 */
export function CategoryManager({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const categories = sortCategories(useCategories(serverId));
  const { data: channels } = useChannels(serverId);
  const reorderMutation = useReorderCategories(serverId);
  const deleteMutation = useDeleteCategory(serverId);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChannelCategoryDto | null>(null);

  function move(categoryId: string, direction: 'up' | 'down') {
    const orderedIds = reorderedCategoryIds(categories, categoryId, direction);
    if (!orderedIds) return;
    reorderMutation.mutate(orderedIds, {
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  const countFor = (categoryId: string) =>
    channels.filter((channel) => channel.categoryId === categoryId).length;

  const columns: PingTableColumn<ChannelCategoryDto>[] = [
    { key: 'name', header: t('categoryName'), render: (category) => category.name },
    {
      key: 'channels',
      header: t('channels'),
      render: (category) => t('categoryChannels', { count: countFor(category.id) }),
    },
    {
      key: 'order',
      header: t('roleOrder'),
      width: 120,
      render: (category) => (
        <div className="flex items-center gap-1">
          <PingIconButton
            aria-label={t('moveUp', { name: category.name })}
            icon={<ChevronUp size={16} />}
            disabled={
              reorderMutation.isPending || !reorderedCategoryIds(categories, category.id, 'up')
            }
            onClick={() => move(category.id, 'up')}
          />
          <PingIconButton
            aria-label={t('moveDown', { name: category.name })}
            icon={<ChevronDown size={16} />}
            disabled={
              reorderMutation.isPending || !reorderedCategoryIds(categories, category.id, 'down')
            }
            onClick={() => move(category.id, 'down')}
          />
        </div>
      ),
    },
    {
      key: 'actions',
      header: t('categoryActions'),
      render: (category) => (
        <div className="flex flex-wrap items-center gap-2">
          <PingButton variant="secondary" size="sm" onClick={() => setRenameTarget(category)}>
            {t('categoryRename')}
          </PingButton>
          <PingPopconfirm
            title={t('categoryDeleteTitle')}
            description={t('categoryDeleteDescription')}
            okText={t('categoryDelete')}
            cancelText={tc('cancel')}
            onConfirm={() =>
              deleteMutation.mutate(category.id, {
                onSuccess: () => pingToast.success(t('categoryDeleted')),
                onError: (error) => pingToast.error(errorMessage(error)),
              })
            }
            disabled={deleteMutation.isPending}
          >
            <PingButton
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending && deleteMutation.variables === category.id}
              disabled={deleteMutation.isPending}
            >
              {t('categoryDelete')}
            </PingButton>
          </PingPopconfirm>
        </div>
      ),
    },
  ];

  return (
    <section aria-label={t('categories')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('categories')}</h2>
          <p className="text-xs text-muted-foreground">{t('categoriesHint')}</p>
        </div>
        <PingButton size="sm" onClick={() => setCreateOpen(true)}>
          {t('categoryCreate')}
        </PingButton>
      </div>
      <PingTable
        label={t('categories')}
        columns={columns}
        rows={categories}
        rowKey={(category) => category.id}
        empty={<PingEmpty description={t('categoryEmpty')} />}
      />
      <CategoryNameDialog
        serverId={serverId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {renameTarget && (
        <CategoryNameDialog
          key={renameTarget.id}
          serverId={serverId}
          open
          categoryId={renameTarget.id}
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </section>
  );
}
