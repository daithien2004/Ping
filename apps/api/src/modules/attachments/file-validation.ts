import { AttachmentLimits, STICKER_FILE_BYTES } from '@ping/shared';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

export class InvalidFile extends Error {}

/** Kích thước xuất tối đa của sticker (ADR-0067): fit trong 512×512, không phóng to. */
const STICKER_MAX_EDGE = 512;

/** Chữ ký chunk `acTL` của APNG — PNG tĩnh hợp lệ không bao giờ chứa chuỗi này. */
const APNG_SIGNATURE = Buffer.from('acTL', 'ascii');

/**
 * Kiểm định sticker (TG.22, ADR-0067): PNG/WebP tĩnh và WebP động (APNG vào được ở kiểm
 * định — file-type trả `image/png` — rồi reencode về WebP động). Không nhận SVG/HTML
 * (file-type không nhận diện được → từ chối sẵn) hay JPEG. Ảnh TĨNH lớn hơn 512×512 bị
 * từ chối (người upload phải tựresize); ảnh ĐỘNG được reencode fit trong 512×512.
 * Trả về thêm `thumbnail` = khung tĩnh (khung đầu của ảnh động) để
 * `prefers-reduced-motion` hiển thị thay cho bản động.
 */
export async function validateStickerFile(bytes: Buffer) {
  try {
    if (!bytes.length || bytes.length > STICKER_FILE_BYTES) throw new InvalidFile();
    const type = await fileTypeFromBuffer(bytes);
    // file-type trả APNG với mime riêng `image/apng` (không phải image/png).
    if (!type || !['image/png', 'image/apng', 'image/webp'].includes(type.mime))
      throw new InvalidFile();
    if (
      type.mime === 'image/png' &&
      !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
    )
      throw new InvalidFile();
    if (type.mime === 'image/webp' && bytes.readUInt32LE(4) + 8 !== bytes.length)
      throw new InvalidFile();
    // `animated: true` để sharp giải mã được mọi khung; số khung thực tế đọc ở metadata.
    // APNG (file-type trả image/png) mang chữ ký `acTL` — coi là ảnh động để reencode giữ
    // chuyển động khi libvips đọc được, nếu không thì rơi về webp tĩnh của khung đầu.
    const image = sharp(bytes, {
      limitInputPixels: AttachmentLimits.IMAGE_PIXELS,
      failOn: 'warning',
      animated: true,
    });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new InvalidFile();
    const animated =
      (meta.pages ?? 1) > 1 ||
      type.mime === 'image/apng' ||
      (type.mime === 'image/png' && bytes.includes(APNG_SIGNATURE));
    if (!animated && (meta.width > STICKER_MAX_EDGE || meta.height > STICKER_MAX_EDGE))
      throw new InvalidFile();
    const output = await image
      .rotate()
      .resize({
        width: STICKER_MAX_EDGE,
        height: STICKER_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
    // Khung tĩnh cho reduced-motion: khung đầu của ảnh động, bản nhỏ của ảnh tĩnh.
    const thumbnail = await sharp(bytes, {
      limitInputPixels: AttachmentLimits.IMAGE_PIXELS,
      failOn: 'warning',
      animated: false,
    })
      .rotate()
      .resize({
        width: STICKER_MAX_EDGE,
        height: STICKER_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
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
