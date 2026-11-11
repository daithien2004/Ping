'use client';

import type { InlineNode, MarkdownBlock } from '../markdown';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { bigEmojiCount, parseMarkdown } from '../markdown';
import { useEmojiMap } from '@/features/emojis/hooks';
import { profileImageUrl } from '@/features/profile/hooks';

export function MarkdownText({ content, serverId }: { content: string; serverId?: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const bigEmoji = useMemo(() => bigEmojiCount(content), [content]);
  return (
    <div
      className={`wrap-break-word whitespace-pre-wrap ${bigEmoji > 0 ? 'text-4xl leading-relaxed' : ''}`}
      data-testid={bigEmoji > 0 ? 'big-emoji' : undefined}
    >
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} serverId={serverId} />
      ))}
    </div>
  );
}

function BlockView({ block, serverId }: { block: MarkdownBlock; serverId?: string }) {
  const t = useTranslations('messages');
  switch (block.type) {
    case 'codeBlock':
      return (
        <pre
          aria-label={t('codeBlockLabel')}
          className="my-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-sm"
        >
          <code>{block.code}</code>
        </pre>
      );
    case 'quoteBlock':
      return (
        <blockquote className="my-1 border-l-4 border-muted-foreground/40 pl-2">
          <InlineNodes nodes={block.children} serverId={serverId} />
        </blockquote>
      );
    case 'listBlock':
      return (
        <ul className="my-1 list-disc pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineNodes nodes={item} serverId={serverId} />
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p>
          <InlineNodes nodes={block.children} serverId={serverId} />
        </p>
      );
  }
}

function InlineNodes({ nodes, serverId }: { nodes: InlineNode[]; serverId?: string }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNodeView key={index} node={node} serverId={serverId} />
      ))}
    </>
  );
}

function InlineNodeView({ node, serverId }: { node: InlineNode; serverId?: string }) {
  const t = useTranslations('messages');
  switch (node.type) {
    case 'text':
      return <>{node.value}</>;
    case 'emoji':
      return <span aria-label={t('emojiLabel')}>{node.unicode}</span>;
    case 'customEmoji':
      return <CustomEmojiNode id={node.id} name={node.name} serverId={serverId} />;
    case 'mention':
      return (
        <span
          className="rounded bg-primary/10 px-1 font-medium text-primary"
          data-testid="mention-chip"
        >
          @{node.username}
        </span>
      );
    case 'bold':
      return (
        <strong>
          <InlineNodes nodes={node.children} serverId={serverId} />
        </strong>
      );
    case 'italic':
      return (
        <em>
          <InlineNodes nodes={node.children} serverId={serverId} />
        </em>
      );
    case 'strikethrough':
      return (
        <s>
          <InlineNodes nodes={node.children} serverId={serverId} />
        </s>
      );
    case 'inlineCode':
      return (
        <code className="rounded bg-muted px-1 font-mono text-[0.9em]">
          <InlineNodes nodes={node.children} serverId={serverId} />
        </code>
      );
    case 'spoiler':
      return <Spoiler serverId={serverId}>{node.children}</Spoiler>;
    case 'link':
      return (
        <a
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-2"
        >
          <InlineNodes nodes={node.children} serverId={serverId} />
        </a>
      );
  }
}

function CustomEmojiNode({ id, name, serverId }: { id: string; name: string; serverId?: string }) {
  const byId = useEmojiMap(serverId);
  const emoji = byId.get(id);
  const src = emoji ? profileImageUrl(emoji.previewUrl || emoji.url) : undefined;
  if (!src) {
    return (
      <span
        className="rounded bg-muted px-1 align-middle text-muted-foreground"
        data-testid="custom-emoji-placeholder"
      >
        :{name}:
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={`:${name}:`}
      title={`:${name}:`}
      loading="lazy"
      className="inline h-5 w-5 align-middle"
    />
  );
}

function Spoiler({ children, serverId }: { children: InlineNode[]; serverId?: string }) {
  const t = useTranslations('messages');
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      aria-label={t('spoiler')}
      aria-pressed={revealed}
      onClick={() => setRevealed(true)}
      className={
        revealed
          ? 'rounded bg-muted px-0.5 text-left'
          : 'rounded bg-muted px-0.5 text-left text-transparent select-none hover:cursor-pointer'
      }
    >
      <InlineNodes nodes={children} serverId={serverId} />
    </button>
  );
}
