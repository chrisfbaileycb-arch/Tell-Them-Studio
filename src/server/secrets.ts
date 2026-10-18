import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Server-only helpers for secrets that must be recoverable (webhook signing keys and inbound
 * praise HMAC keys: both sides need the raw value to compute signatures). They are sealed with
 * AES-256-GCM under a key derived from `SESSION_SECRET`, so a database leak alone does not
 * expose them. Never import this from client code.
 */

const keyFor = (master: Buffer) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'tell-them/sealed-secrets/v1', 32));

export function sealSecret(master: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(master), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

export function openSecret(master: Buffer, sealed: string): string {
  const raw = Buffer.from(sealed, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(master), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** High-entropy token with a recognisable prefix (e.g. `whsec_...`). */
export const newSecret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;
