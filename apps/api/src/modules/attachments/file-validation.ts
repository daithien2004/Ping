import { AttachmentLimits } from '@ping/shared';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

export class InvalidFile extends Error {}

/** Conservative binary allowlist. Originals never become publicly reachable. */
export async function validateFile(
  bytes: Buffer,
  // TG.7: avatar/icon chỉ nhận ảnh tĩnh — PDF chỉ hợp lệ cho tệp tin nhắn.
  { kinds = ['image', 'pdf'] as Array<'image' | 'pdf'> }: { kinds?: Array<'image' | 'pdf'> } = {},
) {
  try {
    if (!bytes.length || bytes.length > AttachmentLimits.FILE_BYTES) throw new InvalidFile();
    const type = await fileTypeFromBuffer(bytes);
    const allowedMimes = [
      ...(['image' as const].some((k) => kinds.includes(k))
        ? ['image/jpeg', 'image/png', 'image/webp']
        : []),
      ...(kinds.includes('pdf') ? ['application/pdf'] : []),
    ];
    if (!type || !allowedMimes.includes(type.mime)) throw new InvalidFile();
    if (type.mime === 'application/pdf') {
      const text = bytes.toString('latin1');
      // Reject active documents, embedded/encrypted content, escaped names and appended payloads.
      if (
        !text.startsWith('%PDF-1.') ||
        !/%%EOF\s*$/.test(text) ||
        !text.includes('xref') ||
        /\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|Encrypt|XFA|ObjStm)\b|<html|<script/i.test(
          text,
        ) ||
        /#[a-f\d]{2}/i.test(text) ||
        bytes.includes(Buffer.from([0x50, 0x4b, 3, 4]))
      )
        throw new InvalidFile();
      return { bytes, thumbnail: undefined, mime: type.mime, width: null, height: null };
    }
    if (
      type.mime === 'image/png' &&
      !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
    )
      throw new InvalidFile();
    if (type.mime === 'image/jpeg' && !bytes.subarray(-2).equals(Buffer.from([255, 217])))
      throw new InvalidFile();
    if (type.mime === 'image/webp' && bytes.readUInt32LE(4) + 8 !== bytes.length)
      throw new InvalidFile();
    const image = sharp(bytes, {
      limitInputPixels: AttachmentLimits.IMAGE_PIXELS,
      failOn: 'warning',
      animated: false,
    });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new InvalidFile();
    const output = await image
      .rotate()
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(output.data)
      .resize({ width: 320, height: 240, fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
    if (output.data.length + thumbnail.length > AttachmentLimits.FILE_BYTES)
      throw new InvalidFile();
    return {
      bytes: output.data,
      thumbnail,
      mime: 'image/webp',
      width: output.info.width,
      height: output.info.height,
    };
  } catch (error) {
    if (error instanceof InvalidFile) throw error;
    throw new InvalidFile('Invalid file');
  }
}
