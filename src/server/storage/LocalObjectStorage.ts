import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ByteRange,
  ObjectStorageAdapter,
  StoredObject,
  assertValidObjectKey,
} from './ObjectStorageAdapter';

/** Filesystem-backed object storage for local development and tests. */
export class LocalObjectStorage implements ObjectStorageAdapter {
  readonly driver = 'local';
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = path.resolve(dataDir, 'objects');
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private resolveKey(key: string): string {
    assertValidObjectKey(key);
    const full = path.resolve(this.root, key);
    // Defence in depth: the key pattern already forbids separators.
    if (path.dirname(full) !== this.root) throw new Error('Invalid object key');
    return full;
  }

  async put(key: string, bytes: Buffer, _mimeType?: string): Promise<void> {
    const full = this.resolveKey(key);
    const tmp = `${full}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, full);
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const full = this.resolveKey(key);
    let size: number;
    try {
      size = (await stat(full)).size;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw err;
    }
    const effective: ByteRange = range
      ? { start: range.start, end: Math.min(range.end, size - 1) }
      : { start: 0, end: Math.max(0, size - 1) };
    return {
      size,
      range: effective,
      stream: createReadStream(full, size === 0 ? undefined : { start: effective.start, end: effective.end }),
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }
}
