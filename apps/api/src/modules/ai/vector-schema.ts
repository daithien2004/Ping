/** Phiên bản schema payload/collection. Tăng khi đổi cấu trúc để buộc tạo collection mới. */
export const VECTOR_SCHEMA_VERSION = '1';

/** Định danh model + số chiều + phiên bản schema, lưu trong payload và tên collection. */
export function embeddingVersion(model: string, dimensions: number): string {
  return `${model}:${dimensions}:schema${VECTOR_SCHEMA_VERSION}`;
}

/**
 * Tên collection Qdrant chỉ gồm chữ/số/gạch dưới. Mỗi cặp model + số chiều + schema
 * có collection riêng để đổi model không trộn vector cũ với vector mới.
 */
export function collectionName(model: string, dimensions: number): string {
  const slug =
    model
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'model';
  return `messages__${slug}__${dimensions}__v${VECTOR_SCHEMA_VERSION}`;
}
