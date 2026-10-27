import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { STICKER_FILE_BYTES } from '@ping/shared';
import { validateFile, validateStickerFile } from './file-validation.js';

const le24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
const webpChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
};

/** VP8L payload từ một WebP tĩnh do sharp sinh ra (bỏ vỏ RIFF, giữ đúng chiều dài khai báo). */
async function vp8lPayload(color: string): Promise<Buffer> {
  const file = await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
    .webp({ lossless: true })
    .toBuffer();
  const sub = file.subarray(12);
  const len = sub.readUInt32LE(4);
  return sub.subarray(8, 8 + len);
}

/**
 * WebP ĐỘNG tự dựng theo WebP container spec: VP8X (cờ animation) + ANIM + 2 khung ANMF.
 * Dùng làm fixture kiểm định sticker vì sharp không sinh được ảnh động từ đầu.
 */
async function animatedWebp(): Promise<Buffer> {
  const [f1, f2] = await Promise.all([vp8lPayload('red'), vp8lPayload('blue')]);
  const vp8x = webpChunk(
    'VP8X',
    Buffer.concat([Buffer.from([0x02]), Buffer.alloc(3), le24(63), le24(63)]),
  );
  const anmf = (payload: Buffer) =>
    webpChunk(
      'ANMF',
      Buffer.concat([
        le24(0),
        le24(0),
        le24(63),
        le24(63),
        le24(100),
        Buffer.from([0]),
        webpChunk('VP8L', payload),
      ]),
    );
  const body = Buffer.concat([vp8x, webpChunk('ANIM', Buffer.alloc(6)), anmf(f1), anmf(f2)]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(4 + body.length);
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), body]);
}

/** PNG chunk với CRC chuẩn (fixture APNG). */
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  let c = 0xffffffff;
  for (const byte of body) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, body, crc]);
}

/** APNG 2 khung (64×64 đỏ/xanh) — file-type trả image/png, nội dung có chữ ký `acTL`. */
async function apng(): Promise<Buffer> {
  const frame = async (color: string) =>
    parsePng(
      await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
        .png()
        .toBuffer(),
    );
  const parsePng = (file: Buffer) => {
    const chunks: Array<{ type: string; data: Buffer }> = [];
    let offset = 8;
    while (offset < file.length) {
      const length = file.readUInt32BE(offset);
      chunks.push({
        type: file.toString('ascii', offset + 4, offset + 8),
        data: file.subarray(offset + 8, offset + 8 + length),
      });
      offset += 12 + length;
    }
    return chunks;
  };
  const [first, second] = await Promise.all([frame('red'), frame('blue')]);
  const ihdr = first.find((chunk) => chunk.type === 'IHDR')!;
  const idat = first.find((chunk) => chunk.type === 'IDAT')!;
  const secondData = second.find((chunk) => chunk.type === 'IDAT')!.data;
  const fctl = (seq: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(seq, 0);
    data.writeUInt32BE(64, 4);
    data.writeUInt32BE(64, 8);
    data.writeUInt32BE(0, 12);
    data.writeUInt32BE(0, 16);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return pngChunk('fcTL', data);
  };
  const fdat = (seq: number, raw: Buffer) => {
    const data = Buffer.concat([Buffer.alloc(4), raw]);
    data.writeUInt32BE(seq, 0);
    return pngChunk('fdAT', data);
  };
  const actl = (() => {
    const data = Buffer.alloc(8);
    data.writeUInt32BE(2, 0);
    return pngChunk('acTL', data);
  })();
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr.data),
    actl,
    fctl(0),
    pngChunk('IDAT', idat.data),
    fctl(1),
    fdat(1, secondData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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

describe('sticker validation (TG.22, ADR-0067)', () => {
  it('reencodes a static PNG ≤ 512×512 to WebP with a static preview', async () => {
    const input = await sharp({
      create: { width: 128, height: 96, channels: 4, background: 'red' },
    })
      .png()
      .toBuffer();
    const result = await validateStickerFile(input);
    expect(result.mime).toBe('image/webp');
    expect(result.width).toBe(128);
    expect(result.height).toBe(96);
    expect(result.thumbnail).toBeInstanceOf(Buffer);
    // Khung tĩnh không phải ảnh động — reduced-motion render được an toàn.
    expect((await sharp(result.thumbnail).metadata()).pages ?? 1).toBe(1);
  });

  it('rejects a static image larger than 512×512 (uploader must resize)', async () => {
    const input = await sharp({
      create: { width: 600, height: 400, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await expect(validateStickerFile(input)).rejects.toThrow();
  });

  it('keeps animation of an animated WebP and emits a static first-frame preview', async () => {
    const input = await animatedWebp();
    const result = await validateStickerFile(input);
    expect(result.mime).toBe('image/webp');
    expect(result.width).toBeLessThanOrEqual(512);
    expect(result.height).toBeLessThanOrEqual(512);
    const animated = await sharp(result.bytes, { animated: true }).metadata();
    expect(animated.pages ?? 1).toBeGreaterThan(1);
    expect((await sharp(result.thumbnail).metadata()).pages ?? 1).toBe(1);
  });

  it('accepts an APNG (validated as animated input)', async () => {
    const result = await validateStickerFile(await apng());
    expect(result.mime).toBe('image/webp');
    expect(result.thumbnail).toBeInstanceOf(Buffer);
  });

  it('rejects JPEG and SVG masquerading as stickers', async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    await expect(validateStickerFile(jpeg)).rejects.toThrow();
    await expect(
      validateStickerFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow();
  });

  it('rejects a file above the 512 KiB sticker budget', async () => {
    // Nhiễu thật (không tuần hoàn) để PNG nén xong vẫn vượt trần tệp gốc.
    const noise = randomBytes(600 * 600 * 3);
    const input = await sharp(noise, { raw: { width: 600, height: 600, channels: 3 } })
      .png()
      .toBuffer();
    expect(input.length).toBeGreaterThan(STICKER_FILE_BYTES);
    await expect(validateStickerFile(input)).rejects.toThrow();
  });
});
