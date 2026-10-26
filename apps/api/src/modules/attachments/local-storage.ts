import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.schema.js';

export abstract class Storage {
  abstract read(key: string): Promise<Buffer>;
  abstract write(key: string, bytes: Buffer): Promise<void>;
  abstract remove(key: string): Promise<void>;
}

@Injectable()
export class LocalStorage extends Storage {
  readonly root: string;
  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = resolve(config.get('ATTACHMENT_STORAGE_DIR', { infer: true }));
  }
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\.(raw|ready|thumb)$/.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key);
  }
  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    }
  }
  async write(key: string, bytes: Buffer) {
    const target = this.path(key);
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temp, target);
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
  async remove(key: string) {
    try {
      await rm(this.path(key), { force: true });
    } catch {
      throw new ServiceUnavailableException('Attachment storage unavailable');
    }
  }
  async healthy() {
    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root, 6);
      return true;
    } catch {
      return false;
    }
  }
}
