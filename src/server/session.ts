import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'tt_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

interface SessionPayload {
  /** Creator id. */
  cid: string;
  /** Expiry, unix seconds. */
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function sign(data: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(creatorId: string, secret: Buffer, now = Date.now()): string {
  const payload: SessionPayload = { cid: creatorId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Returns the creator id when the token is authentic and unexpired, otherwise null. */
export function verifySessionToken(token: string | undefined, secret: Buffer, now = Date.now()): string | null {
  if (!token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.cid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < now) return null;
    return payload.cid;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      /* ignore malformed cookie values */
    }
  }
  return out;
}

export function readSessionCreatorId(req: Request, secret: Buffer): string | null {
  return verifySessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE], secret);
}

export function setSessionCookie(res: Response, creatorId: string, secret: Buffer, secure: boolean): void {
  const attrs = [
    `${SESSION_COOKIE}=${createSessionToken(creatorId, secret)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])];
  res.append('Set-Cookie', attrs.join('; '));
}

/** Handles are lower-case, `@`-prefixed, 3-30 chars of [a-z0-9_]. Returns null when invalid. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  const withAt = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  return /^@[a-z0-9_]{3,30}$/.test(withAt) ? withAt : null;
}

/**
 * Handles that can never be claimed: the studio default shared by every new browser, and the
 * bundled demo creators. Users must choose their own handle before syncing to the live catalog.
 */
export const RESERVED_HANDLES = new Set([
  '@studio_voyager',
  '@riverfront_rockers',
  '@glam_shred_88',
  '@velvet_groove_fm',
  '@melody_maker_88',
  '@tell_them_studio',
  '@admin',
  '@moderator',
  '@support',
]);
