import type { Readable } from 'node:stream';
import {
  ByteRange,
  ObjectStorageAdapter,
  StoredObject,
  assertValidObjectKey,
} from './ObjectStorageAdapter';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** Custom endpoint for S3-compatible providers (R2, MinIO, Spaces, ...). */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  keyPrefix?: string;
}

/**
 * S3-compatible object storage. The SDK is imported lazily so deployments that never
 * configure S3 do not load it. Credentials stay inside this server-only module.
 */
export class S3ObjectStorage implements ObjectStorageAdapter {
  readonly driver = 's3';
  private client!: import('@aws-sdk/client-s3').S3Client;
  private sdk!: typeof import('@aws-sdk/client-s3');

  constructor(private readonly config: S3StorageConfig) {}

  async init(): Promise<void> {
    this.sdk = await import('@aws-sdk/client-s3');
    const { accessKeyId, secretAccessKey } = this.config;
    this.client = new this.sdk.S3Client({
      region: this.config.region,
      ...(this.config.endpoint ? { endpoint: this.config.endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    await this.client.send(new this.sdk.HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  private fullKey(key: string): string {
    assertValidObjectKey(key);
    return `${this.config.keyPrefix ?? 'creations/'}${key}`;
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new this.sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.fullKey(key),
        Body: bytes,
        ContentType: mimeType,
        CacheControl: 'private, max-age=0',
      })
    );
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    try {
      const out = await this.client.send(
        new this.sdk.GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.fullKey(key),
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        })
      );
      if (!out.Body) return null;
      const contentRange = /bytes (\d+)-(\d+)\/(\d+)/.exec(out.ContentRange ?? '');
      const length = Number(out.ContentLength ?? 0);
      const size = contentRange ? Number(contentRange[3]) : length;
      const effective: ByteRange = contentRange
        ? { start: Number(contentRange[1]), end: Number(contentRange[2]) }
        : { start: 0, end: Math.max(0, size - 1) };
      return { stream: out.Body as Readable, size, range: effective };
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new this.sdk.DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) })
    );
  }
}
