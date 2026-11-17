import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';

export abstract class Storage {
  abstract read(key: string): Promise<Buffer>;
  abstract write(key: string, bytes: Buffer): Promise<void>;
  abstract remove(key: string): Promise<void>;
}

const KEY = /^[a-f0-9-]{36}\.(raw|ready|thumb)$/;

/**
 * File đính kèm nằm trong object storage tương thích S3 (MinIO ở dev và VPS), không còn trên volume dùng chung (ADR-0099):
 * mọi bản sao API, worker và Realtime đều stateless và có thể nằm trên máy khác nhau.
 */
@Injectable()
export class ObjectStorage extends Storage implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>, metrics: MetricsService) {
    super();
    metrics.registerDependency('attachment_storage', () => this.healthy());
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
      maxAttempts: 2,
    });
  }

  // Tạo bucket nếu chưa có; lỗi không chặn khởi động (API vẫn phục vụ phần không cần file, /ready không phụ thuộc storage).
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.logger.warn({ err: (error as Error).message }, 'object storage chưa sẵn sàng');
      }
    }
  }

  private key(key: string): string {
    if (!KEY.test(key)) throw new Error('Invalid storage key');
    return key;
  }

  async read(key: string): Promise<Buffer> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      );
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    }
  }

  async write(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), Body: bytes }),
      );
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
