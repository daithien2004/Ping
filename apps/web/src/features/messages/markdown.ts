/**
 * Markdown tập con an toàn (TG.4, ADR-0054). Parser thuần sinh AST node có kiểu liệt kê —
 * renderer chỉ dựng React element cho các kiểu này, KHÔNG có đường sinh HTML thô.
 * Bộ test XSS trong markdown.test.ts là ràng buộc bắt buộc của mọi thay đổi ở đây.
 */

import { SHORTCODE_TO_UNICODE as EMOJI } from '@/features/emoji/map';

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'emoji'; unicode: string }
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

/** Chuẩn hóa URL để kiểm scheme: bỏ mọi ký tự điều khiển/zero-width có thể lừa bộ kiểm. */
function sanitizeUrlCandidate(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
}

function linkNode(rawUrl: string): InlineNode {
  const href = sanitizeUrlCandidate(rawUrl);
  // Chỉ http/https sau khi làm sạch — mọi scheme khác (javascript:, data:, …) thành text.
  if (!/^https?:\/\//i.test(href)) {
    return { type: 'text', value: rawUrl };
  }
  return { type: 'link', href, children: [{ type: 'text', value: rawUrl }] };
}

/**
 * Một đợt quét inline duy nhất theo thứ tự ưu tiên: inline code (nội dung thuần) → đậm →
 * nghiêng/gạch/spoiler → mention → emoji → liên kết. Nhóm không khớp rơi vào text.
 * Mention yêu cầu @ đứng sau ranh giới từ (lookbehind) nên email không thành chip.
 */
const INLINE_PATTERN = new RegExp(
  [
    '(`+)([^`\\n]+?)\\1', // 1,2: inline code
    '\\*\\*([^*\\n]+?)\\*\\*', // 3: đậm
    '\\*([^*\\n]+?)\\*', // 4: nghiêng
    '~~([^~\\n]+?)~~', // 5: gạch ngang
    '\\|\\|([^|\\n]+?)\\|\\|', // 6: spoiler
    '(?<![\\w@.])@([A-Za-z0-9_.-]{3,32})', // 7: mention
    ':([a-z_]{2,20}):', // 8: shortcode emoji
    '(https?://[^\\s<]+)', // 9: autolink
  ].join('|'),
  'g',
);

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', value: text.slice(last, index) });
    const [full, fence, code, bold, italic, strike, spoiler, mention, shortcode, url] = match;
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

/** Khối: code fence ``` ưu tiên đầu tiên, rồi `> ` trích dẫn, `- ` danh sách, còn lại là đoạn. */
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
    // Fence không đóng: coi phần còn lại là code (nội dung vẫn thuần).
    blocks.push({ type: 'codeBlock', code: codeLines.join('\n') });
  }
  flushAll();
  return blocks;
}

/**
 * Tin "chỉ emoji" (TG.23): toàn bộ nội dung là emoji + khoảng trắng (1–3 emoji, không cú
 * pháp nào khác) → render cỡ lớn kiểu Discord. Đếm trực tiếp ký tự pictographic trên chuỗi
 * gốc — emoji Unicode literal KHÔNG thành node `emoji` ở parser (chỉ shortcode mới thành).
 * Trả về số emoji nếu thỏa, ngược lại 0.
 */
const EMOJI_CHAR = /\p{Extended_Pictographic}/gu;

export function bigEmojiCount(content: string): number {
  const trimmed = content.trim();
  if (trimmed === '') return 0;
  const count = trimmed.match(EMOJI_CHAR)?.length ?? 0;
  if (count < 1 || count > 3) return 0;
  // Mọi ký tự còn lại phải là emoji/selector/khoảng trắng — không chữ, không cú pháp.
  const rest = trimmed.replace(EMOJI_CHAR, '');
  // Phần còn lại chỉ được là khoảng trắng/selector — không chữ, số hay cú pháp markdown.
  return /^\s*$/.test(rest) && !/[a-zA-Z0-9<>`*_~:|@/-]/.test(rest) ? count : 0;
}
