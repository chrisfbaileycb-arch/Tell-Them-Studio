import { createHmac, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { StoredCreation } from '../../types/community';
import type { WebhookDelivery, WebhookEndpoint, WebhookEvent } from '../../types/distribution';
import type { CatalogContext } from '../catalog/factory';
import type { JobRecord } from '../jobs/JobQueue';
import { openSecret } from '../secrets';

export const WEBHOOKS = 'webhook-endpoint';
export const DELIVERIES = 'webhook-delivery';
export const JOB_DISPATCH_WEBHOOK = 'dispatch-webhook';

/** Thrown after the delivery row already holds the failure details. */
class RecordedFailure extends Error {}

export interface StoredWebhook extends WebhookEndpoint {
  secretSealed: string;
}

// ------------------------------------------------------------------ SSRF guard

function isPrivateV4(o: number[]): boolean {
  const [a, b, c] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Expands an IPv6 literal into eight 16-bit groups (handles `::` and embedded IPv4). */
function expandV6(addr: string): number[] | null {
  let a = addr.toLowerCase().split('%')[0];
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (tail) {
    const [x, y, z, w] = tail.slice(1).map(Number);
    a = a.slice(0, tail.index) + ((x << 8) | y).toString(16) + ':' + ((z << 8) | w).toString(16);
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : null;
}

/** True for loopback, private, link-local, multicast, documentation and other non-public ranges. */
export function isPrivateAddress(addr: string): boolean {
  const kind = net.isIP(addr);
  if (kind === 4) return isPrivateV4(addr.split('.').map(Number));
  if (kind !== 6) return true; // anything unparseable is refused
  const g = expandV6(addr);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => isPrivateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4(g[6], g[7]); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link/site local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Syntactic checks done when an endpoint is registered; connection-time checks happen in `postJson`. */
export function validateWebhookUrl(raw: unknown, allowPrivate: boolean): UrlCheck {
  if (typeof raw !== 'string' || raw.length > 2000) return { ok: false, error: 'url must be a string up to 2000 characters.' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'url is not a valid URL.' };
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    return { ok: false, error: 'Webhook URLs must use https.' };
  }
  if (url.username || url.password) return { ok: false, error: 'Webhook URLs must not contain credentials.' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
      return { ok: false, error: 'Webhook URLs must point to a public host.' };
    }
    if (net.isIP(host) && isPrivateAddress(host)) return { ok: false, error: 'Webhook URLs must point to a public address.' };
  }
  return { ok: true, url };
}

/** Resolves a hostname and refuses private/reserved results (checked at connect time). */
export const guardedLookup =
  (allowPrivate: boolean) =>
  (hostname: string, options: dns.LookupOptions, cb: (...args: any[]) => void) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return cb(err);
      const usable = allowPrivate ? addrs : addrs.filter((a) => !isPrivateAddress(a.address));
      if (!usable.length) return cb(new Error('Webhook target resolves to a private or reserved address.'));
      if (options?.all) return cb(null, usable);
      cb(null, usable[0].address, usable[0].family);
    });
  };

export interface PostResult {
  status: number;
  snippet: string;
}

/**
 * POSTs JSON without following redirects, cookies or credentials. The destination address is
 * validated at connect time (so DNS rebinding cannot swap in a private address), the response
 * body is capped, and the whole exchange has a hard timeout.
 */
export function postJson(
  target: string,
  headers: Record<string, string>,
  body: string,
  opts: { allowPrivate: boolean; timeoutMs: number }
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const check = validateWebhookUrl(target, opts.allowPrivate);
    if ('error' in check) return reject(new Error(check.error));
    const u = check.url;
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), 'user-agent': 'TellThemStudio-Webhooks/1' },
        agent: false,
        lookup: guardedLookup(opts.allowPrivate) as any,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= 2048) chunks.push(c);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, snippet: Buffer.concat(chunks).toString('utf8').slice(0, 200) });
        res.on('end', done);
        res.on('close', done);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out.')));
    req.on('error', reject);
    req.end(body);
  });
}

// --------------------------------------------------------------------- signing

export const signPayload = (secret: string, timestamp: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

// ------------------------------------------------------------------- emitting

interface DispatchPayload {
  deliveryId: string;
  endpointId: string;
  event: WebhookEvent | 'ping';
  data: unknown;
  createdAt: string;
}

async function enqueueDelivery(ctx: CatalogContext, endpoint: StoredWebhook, event: WebhookEvent | 'ping', data: unknown): Promise<string> {
  const now = new Date().toISOString();
  const delivery: WebhookDelivery = {
    id: randomUUID(),
    endpointId: endpoint.id,
    event,
    status: 'pending',
    attempts: 0,
    lastStatusCode: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await ctx.repo.putDoc(DELIVERIES, delivery.id, delivery, { k1: endpoint.id, n1: Date.parse(now) });
  const payload: DispatchPayload = { deliveryId: delivery.id, endpointId: endpoint.id, event, data, createdAt: now };
  await ctx.jobs.enqueue(JOB_DISPATCH_WEBHOOK, payload, { dedupeKey: delivery.id, maxAttempts: ctx.distribution.webhookMaxAttempts });
  return delivery.id;
}

/** Fire-and-forget fan-out to the creator's matching endpoints; never throws into request paths. */
export async function emitEvent(ctx: CatalogContext, creatorId: string, event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const endpoints = (await ctx.repo.findDocs<StoredWebhook>(WEBHOOKS, { k1: creatorId, limit: 50 })).map((r) => r.data);
    for (const ep of endpoints) {
      if (ep.active && ep.events.includes(event)) await enqueueDelivery(ctx, ep, event, data);
    }
  } catch (err) {
    console.warn('Webhook fan-out failed:', err instanceof Error ? err.message : err);
  }
}

export async function sendTestPing(ctx: CatalogContext, endpoint: StoredWebhook): Promise<string> {
  return enqueueDelivery(ctx, endpoint, 'ping', { message: 'Tell Them Studio webhook test' });
}

/** Minimal, public-safe projection included in creation events. */
export async function creationEventData(ctx: CatalogContext, c: StoredCreation) {
  const [creator] = await ctx.repo.getCreatorsByIds([c.creatorId]);
  const base = ctx.distribution.publicBaseUrl?.replace(/\/$/, '') ?? '';
  return {
    creation: {
      id: c.id,
      title: c.title,
      genre: c.genre,
      kind: c.kind,
      creatorHandle: creator?.handle ?? null,
      audioUrl: `${base}/api/creations/${c.id}/audio`,
      remixOfId: c.remixOfId,
      provenance: c.provenance,
    },
  };
}

export async function emitCreationEvent(ctx: CatalogContext, event: WebhookEvent, c: StoredCreation): Promise<void> {
  try {
    await emitEvent(ctx, c.creatorId, event, await creationEventData(ctx, c));
  } catch {
    /* best effort */
  }
}

// ------------------------------------------------------------------ dispatching

export function registerWebhookHandlers(ctx: CatalogContext): void {
  ctx.worker.register(JOB_DISPATCH_WEBHOOK, async (job: JobRecord) => {
    const p = job.payload as DispatchPayload;
    const delivery = await ctx.repo.getDoc<WebhookDelivery>(DELIVERIES, p.deliveryId);
    const endpoint = await ctx.repo.getDoc<StoredWebhook>(WEBHOOKS, p.endpointId);
    const touch = (patch: Partial<WebhookDelivery>) =>
      delivery
        ? ctx.repo.putDoc(
            DELIVERIES,
            delivery.id,
            { ...delivery, attempts: job.attempts, updatedAt: new Date().toISOString(), ...patch },
            { k1: delivery.endpointId, n1: Date.parse(delivery.createdAt) }
          )
        : Promise.resolve();
    if (!delivery) return;
    if (!endpoint || (!endpoint.active && p.event !== 'ping')) {
      await touch({ status: 'dead', lastError: 'Endpoint was removed or disabled.' });
      return;
    }

    const body = JSON.stringify({ id: p.deliveryId, event: p.event, createdAt: p.createdAt, data: p.data });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = openSecret(ctx.sessionSecret, endpoint.secretSealed);
    try {
      const res = await postJson(
        endpoint.url,
        {
          'x-tellthem-event': String(p.event),
          'x-tellthem-delivery': p.deliveryId,
          'x-tellthem-timestamp': timestamp,
          'x-tellthem-signature': signPayload(secret, timestamp, body),
        },
        body,
        { allowPrivate: ctx.distribution.allowPrivateWebhookTargets, timeoutMs: ctx.distribution.webhookTimeoutMs }
      );
      if (res.status >= 200 && res.status < 300) {
        await touch({ status: 'delivered', lastStatusCode: res.status, lastError: null });
        return;
      }
      await touch({
        status: job.attempts >= job.maxAttempts ? 'dead' : 'pending',
        lastStatusCode: res.status,
        lastError: `Receiver answered HTTP ${res.status}.`,
      });
      throw new RecordedFailure(`Receiver answered HTTP ${res.status}.`);
    } catch (err) {
      if (!(err instanceof RecordedFailure)) {
        const message = err instanceof Error ? err.message : String(err);
        await touch({ status: job.attempts >= job.maxAttempts ? 'dead' : 'pending', lastError: message.slice(0, 200) });
      }
      throw err; // the queue applies exponential backoff, then dead-letters
    }
  });
}
