import { describe, expect, it } from 'vitest';
import { parseMarkdown, type MarkdownNode } from './markdown.js';

describe('parseMarkdown — tập con markdown (TG.4)', () => {
  it('inline: đậm, nghiêng, gạch ngang, code', () => {
    const [p] = parseMarkdown('**đậm** và *nghiêng* và ~~bỏ~~ và `code`') as [
      { type: 'paragraph'; children: MarkdownNode[] },
    ];
    expect(p.type).toBe('paragraph');
    expect(p.children.map((node) => node.type)).toEqual([
      'bold',
      'text',
      'italic',
      'text',
      'strikethrough',
      'text',
      'inlineCode',
    ]);
  });

  it('code block và trích dẫn và danh sách', () => {
    const nodes = parseMarkdown('```\nconst a = 1;\n```\n> dòng trích dẫn\n- mục một\n- mục hai');
    expect(nodes.map((node) => node.type)).toEqual(['codeBlock', 'quoteBlock', 'listBlock']);
    const code = nodes[0]!;
    expect(code.type === 'codeBlock' && code.code).toBe('const a = 1;');
  });

  it('liên kết http/https tự nhận; shortcode emoji thành emoji node', () => {
    const [p] = parseMarkdown('xem https://example.com/a?b=1 nhé :smile:') as [
      { type: 'paragraph'; children: MarkdownNode[] },
    ];
    const link = p.children.find((node) => node.type === 'link');
    expect(link?.type === 'link' && link.href).toBe('https://example.com/a?b=1');
    const emoji = p.children.find((node) => node.type === 'emoji');
    expect(emoji?.type === 'emoji' && emoji.unicode).toBe('😄');
  });

  it('mention token thành mention node', () => {
    const [p] = parseMarkdown('gọi @alice vào đây') as [
      { type: 'paragraph'; children: MarkdownNode[] },
    ];
    const mention = p.children.find((node) => node.type === 'mention');
    expect(mention && mention.type === 'mention' && mention.username).toBe('alice');
  });

  it('nội dung trong inline code / code block không xử lý inline (markdown injection vô hiệu)', () => {
    const [p] = parseMarkdown('`**không đậm** :smile: https://x.y`') as [
      { type: 'paragraph'; children: MarkdownNode[] },
    ];
    expect(p.children).toHaveLength(1);
    const only = p.children[0]!;
    const code = only.type === 'inlineCode' ? only.children[0]! : undefined;
    expect(code?.type === 'text' && code.value).toBe('**không đậm** :smile: https://x.y');
  });

  it('dấu * _ ~ đơn lẻ không vô tình bật cú pháp', () => {
    const [p] = parseMarkdown('a * b _ c ~ d') as [{ type: 'paragraph'; children: MarkdownNode[] }];
    expect(p.children.every((node) => node.type === 'text')).toBe(true);
  });
});

describe('parseMarkdown — bộ test XSS (OWASP, scheme, lồng, Unicode)', () => {
  const CASES: Array<[string, string]> = [
    ['script tag', '<script>alert(1)</script>'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg/onload=alert(1)>'],
    ['iframe', '<iframe src="https://evil.example"></iframe>'],
    ['event handler', '<body onload=alert(1)>xin chào</body>'],
    ['javascript link', 'bấm [đây](javascript:alert(1))'],
    ['JAVASCRIPT uppercase', 'bấm [x](JAVASCRIPT:alert(1))'],
    ['data link', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript link', '[x](vbscript:msgbox(1))'],
    ['scheme chèn zero-width', '[x](java\u200bscript:alert(1))'],
    ['scheme chèn RTL', '[x](java\u202Escript:alert(1))'],
    ['tab trong scheme', '[x](java\tscript:alert(1))'],
    ['newline trong scheme', '[x](java\nscript:alert(1))'],
    ['HTML lồng không khớp', '<b><i>x</i></b>'],
    ['autolink giả mạo', '<a href="javascript:alert(1)">x</a>'],
    ['markdown link độc', '[a](https://ok.com) [b](javascript:alert(1))'],
  ];

  for (const [name, payload] of CASES) {
    it(`${name} — chỉ còn văn bản thuần, không node link độc`, () => {
      const nodes = parseMarkdown(payload);
      const links: Array<Extract<MarkdownNode, { type: 'link' }>> = [];
      const collect = (node: MarkdownNode): void => {
        if (node.type === 'link') {
          links.push(node);
          return;
        }
        if (node.type === 'paragraph' || node.type === 'quoteBlock') {
          node.children.forEach(collect);
        }
        if (node.type === 'listBlock') node.items.forEach((item) => item.forEach(collect));
        if (
          node.type === 'bold' ||
          node.type === 'italic' ||
          node.type === 'strikethrough' ||
          node.type === 'inlineCode' ||
          node.type === 'spoiler'
        ) {
          node.children.forEach(collect);
        }
      };
      nodes.forEach(collect);
      for (const link of links) {
        expect(link.href.toLowerCase()).toMatch(/^https?:\/\//);
      }
      // Không node nào ngoài tập cho phép.
      const allowed = new Set([
        'text',
        'bold',
        'italic',
        'strikethrough',
        'inlineCode',
        'codeBlock',
        'spoiler',
        'link',
        'mention',
        'emoji',
        'quoteBlock',
        'listBlock',
        'paragraph',
      ]);
      const check = (node: MarkdownNode): void => {
        expect(allowed.has(node.type)).toBe(true);
        if (node.type === 'paragraph' || node.type === 'quoteBlock') node.children.forEach(check);
        if (node.type === 'listBlock') node.items.forEach((item) => item.forEach(check));
        if (
          node.type === 'bold' ||
          node.type === 'italic' ||
          node.type === 'strikethrough' ||
          node.type === 'inlineCode' ||
          node.type === 'spoiler' ||
          node.type === 'link'
        ) {
          node.children.forEach(check);
        }
      };
      nodes.forEach(check);
    });
  }
});
