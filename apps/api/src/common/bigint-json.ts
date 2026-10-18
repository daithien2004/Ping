// Prisma biểu diễn bitmask quyền (Role.permissions) bằng BigInt, mà
// `JSON.stringify` ném TypeError khi gặp BigInt. Serialize thành chuỗi thập
// phân ("64") — API contract dùng string cho bitmask vì nó vượt
// Number.MAX_SAFE_INTEGER; client đẩy lại string thì zod `coerce.bigint()`
// (roles/schemas.ts) đọc được. Import side-effect ở app.module.ts để cả e2e
// (chạy AppModule nhưng không chạy main.ts) cũng có hiệu lực.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint): string {
  return this.toString();
};

export {};
