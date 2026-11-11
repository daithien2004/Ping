import { SHORTCODE_TO_UNICODE as EMOJI } from '@/features/emoji/map';

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'emoji'; unicode: string }
  | { type: 'customEmoji'; id: string; name: string }
  | { type: 'mention'; username: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strikethrough'; children: InlineNode[] }
  | { type: 'inlineCode'; children: [InlineNode] }
  | { type: 'spoiler'; children: InlineNode[] }
  | { type: 'link'; href: string; children: [InlineNode] };

export type MarkdownBlock =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'codeBlock'; code: string }
  | { type: 'quoteBlock'; children: InlineNode[] }
  | { type: 'listBlock'; items: InlineNode[][] };

export type MarkdownNode = MarkdownBlock | InlineNode;

function sanitizeUrlCandidate(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
}

function linkNode(rawUrl: string): InlineNode {
  const href = sanitizeUrlCandidate(rawUrl);
  if (!/^https?:\/\//i.test(href)) {
    return { type: 'text', value: rawUrl };
  }
  return { type: 'link', href, children: [{ type: 'text', value: rawUrl }] };
}

const INLINE_PATTERN = new RegExp(
  [
    '(`+)([^`\\n]+?)\\1',
    '\\*\\*([^*\\n]+?)\\*\\*',
    '\\*([^*\\n]+?)\\*',
    '~~([^~\\n]+?)~~',
    '\\|\\|([^|\\n]+?)\\|\\|',
    '(?<![\\w@.])@([A-Za-z0-9_.-]{3,32})',
    ':([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
    ':([a-z_]{2,20}):',
    '(https?://[^\\s<]+)',
  ].join('|'),
  'g',
);

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', value: text.slice(last, index) });
    const [
      full,
      fence,
      code,
      bold,
      italic,
      strike,
      spoiler,
      mention,
      customName,
      customId,
      shortcode,
      url,
    ] = match;
    if (fence !== undefined && code !== undefined) {
      nodes.push({ type: 'inlineCode', children: [{ type: 'text', value: code }] });
    } else if (bold !== undefined) {
      nodes.push({ type: 'bold', children: parseInline(bold) });
    } else if (italic !== undefined) {
      nodes.push({ type: 'italic', children: parseInline(italic) });
    } else if (strike !== undefined) {
      nodes.push({ type: 'strikethrough', children: parseInline(strike) });
    } else if (spoiler !== undefined) {
      nodes.push({ type: 'spoiler', children: parseInline(spoiler) });
    } else if (mention !== undefined) {
      nodes.push({ type: 'mention', username: mention });
    } else if (customName !== undefined && customId !== undefined) {
      nodes.push({ type: 'customEmoji', id: customId, name: customName });
    } else if (shortcode !== undefined) {
      const unicode = EMOJI[shortcode];
      if (unicode) {
        nodes.push({ type: 'emoji', unicode });
      } else {
        nodes.push({ type: 'text', value: full });
      }
    } else if (url !== undefined) {
      nodes.push(linkNode(url));
    } else {
      nodes.push({ type: 'text', value: full });
    }
    last = index + full.length;
  }
  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  return nodes;
}

export function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];

  let inCode = false;
  let codeLines: string[] = [];
  let paragraphLines: string[] = [];
  let quoteLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraphLines.join('\n')) });
      paragraphLines = [];
    }
  };
  const flushQuote = () => {
    if (quoteLines.length > 0) {
      blocks.push({ type: 'quoteBlock', children: parseInline(quoteLines.join('\n')) });
      quoteLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'listBlock', items: listItems.map((item) => parseInline(item)) });
      listItems = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'codeBlock', code: codeLines.join('\n') });
        codeLines = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      quoteLines.push(line.slice(2));
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      flushQuote();
      listItems.push(line.slice(2));
      continue;
    }
    flushQuote();
    flushList();
    paragraphLines.push(line);
  }
  if (inCode && codeLines.length > 0) {
    blocks.push({ type: 'codeBlock', code: codeLines.join('\n') });
  }
  flushAll();
  return blocks;
}

const EMOJI_CHAR = /\p{Extended_Pictographic}/gu;

export function bigEmojiCount(content: string): number {
  const trimmed = content.trim();
  if (trimmed === '') return 0;
  const count = trimmed.match(EMOJI_CHAR)?.length ?? 0;
  if (count < 1 || count > 3) return 0;
  const rest = trimmed.replace(EMOJI_CHAR, '');
  return /^\s*$/.test(rest) && !/[a-zA-Z0-9<>`*_~:|@/-]/.test(rest) ? count : 0;
}
