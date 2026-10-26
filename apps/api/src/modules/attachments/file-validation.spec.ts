import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateFile } from './file-validation.js';

describe('attachment quarantine', () => {
  it.each([
    ['fake.png', Buffer.from('<svg onload="alert(1)"/>')],
    ['fake.pdf', Buffer.from('<html>executable</html>')],
    ['fake.jpg', Buffer.from('MZ executable')],
    ['active.pdf', Buffer.from('%PDF-1.4\n/JavaScript /JS (app.alert(1))\n%%EOF')],
    ['mixed.pdf', Buffer.from('%PDF-1.4\n%%EOF\n<html>bad</html>')],
    [
      'compressed-actions.pdf',
      Buffer.from('%PDF-1.4\n/Type /ObjStm /Filter /FlateDecode\nxref\n%%EOF'),
    ],
  ])('rejects malicious %s', async (_name, bytes) => {
    await expect(validateFile(bytes)).rejects.toThrow();
  });

  it('reencodes an image without metadata and produces a thumbnail', async () => {
    const input = await sharp({ create: { width: 32, height: 24, channels: 3, background: 'red' } })
      .withMetadata()
      .png()
      .toBuffer();
    const result = await validateFile(input);
    expect(result.mime).toBe('image/webp');
    expect(result.width).toBe(32);
    expect(result.height).toBe(24);
    expect(result.thumbnail).toBeInstanceOf(Buffer);
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
  });

  it('rejects an image with appended HTML', async () => {
    const input = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    await expect(
      validateFile(Buffer.concat([input, Buffer.from('<html>bad</html>')])),
    ).rejects.toThrow();
  });
});
