// JSON.stringify ném TypeError với BigInt; serialize thành string ('64') vì bitmask vượt MAX_SAFE_INTEGER.
// Import side-effect ở app.module.ts để e2e (không chạy main.ts) cũng có hiệu lực.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint): string {
  return this.toString();
};

export {};
