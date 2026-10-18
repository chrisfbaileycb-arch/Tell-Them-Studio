import type { Readable } from 'node:stream';

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

export interface StoredObject {
  stream: Readable;
  /** Total object size in bytes. */
  size: number;
  /** The range actually being streamed (the whole object when no range was requested). */
  range: ByteRange;
}

/**
 * Binary object persistence contract. Implementations: local filesystem (development)
 * and S3-compatible storage (production). Keys are flat `<id>.<ext>` names.
 */
export interface ObjectStorageAdapter {
  readonly driver: string;
  init(): Promise<void>;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string, range?: ByteRange): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export const OBJECT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$/;

export function assertValidObjectKey(key: string): void {
  if (!OBJECT_KEY_PATTERN.test(key)) throw new Error('Invalid object key');
}

/**
 * Returns true only when all required S3 storage environment variables are present.
 * When false, the server silently falls back to LocalObjectStorage.
 */
export function hasS3Credentials(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    env.S3_BUCKET?.trim() &&
      env.S3_ACCESS_KEY_ID?.trim() &&
      env.S3_SECRET_ACCESS_KEY?.trim()
  );
}

