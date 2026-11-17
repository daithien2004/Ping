// Chuyển file đính kèm cũ từ thư mục (volume `uploads` trước ADR-0099) sang object storage, một lần:
//   docker run --rm -v pingprod_uploads:/old:ro --network pingprod_default --env-file .env.prod \
//     -e S3_ENDPOINT=http://minio:9000 ghcr.io/<owner>/ping-api:<tag> node dist/migrate-uploads.js /old
// Idempotent: ghi đè cùng key bằng cùng nội dung. In số file đã chuyển và số file bị bỏ qua.
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node dist/migrate-uploads.js <thư mục cũ>');
const env = (name: string, fallback: string) => process.env[name] || fallback;
const bucket = env('S3_BUCKET', 'ping-attachments');
const client = new S3Client({
  endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
  region: env('S3_REGION', 'us-east-1'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: env('S3_ACCESS_KEY', 'minioadmin'),
    secretAccessKey: env('S3_SECRET_KEY', 'minioadmin'),
  },
});

const KEY = /^[a-f0-9-]{36}\.(raw|ready|thumb)$/;
let moved = 0;
let skipped = 0;
for (const name of await readdir(dir)) {
  if (!KEY.test(name)) {
    skipped++;
    continue;
  }
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: name, Body: await readFile(path.join(dir, name)) }),
  );
  moved++;
}
console.log(JSON.stringify({ moved, skipped }));
