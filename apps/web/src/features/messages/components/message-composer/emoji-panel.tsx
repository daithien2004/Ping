'use client';

import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((m) => m.EmojiPicker),
  { ssr: false },
);

export function EmojiPanel({
  serverId,
  onInsert,
}: {
  serverId?: string;
  onInsert: (text: string) => void;
}) {
  return (
    <div className="mb-2 flex justify-start">
      <EmojiPicker serverId={serverId} onPick={onInsert} onPickCustom={onInsert} />
    </div>
  );
}
