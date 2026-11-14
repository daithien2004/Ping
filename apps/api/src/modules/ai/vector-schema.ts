// Tăng khi đổi cấu trúc payload/collection để buộc tạo collection mới.
export const VECTOR_SCHEMA_VERSION = '1';

export function embeddingVersion(model: string, dimensions: number): string {
  return `${model}:${dimensions}:schema${VECTOR_SCHEMA_VERSION}`;
}

export function collectionName(model: string, dimensions: number): string {
  const slug =
    model
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'model';
  return `messages__${slug}__${dimensions}__v${VECTOR_SCHEMA_VERSION}`;
}
