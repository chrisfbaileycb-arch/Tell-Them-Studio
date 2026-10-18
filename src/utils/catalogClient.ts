/**
 * Browser client for the durable community catalog (`/api/session`, `/api/creations`).
 *
 * Contract: nothing here ever throws. Every call resolves to a `CatalogResult`, and any
 * network or server problem is reported as a failure the UI can fold into its local-only
 * fallback mode. No secrets exist client-side; authentication is an HttpOnly cookie.
 */
import type {
  ApiErrorBody,
  CatalogHealth,
  CreateCreationRequest,
  CreationResponse,
  CreatorProfile,
  LineageResponse,
  PublicCreation,
  PublishedListResponse,
  ReportRequest,
  RevocationMode,
  RevokeConsentRequest,
  RevokeConsentResponse,
  SessionResponse,
} from '../types/community';
import type {
  EpisodeView,
  PraiseBadge,
  PublicPraise,
  PublicShow,
  ShowScheduleResponse,
  WebhookCreated,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEvent,
} from '../types/distribution';

export type CatalogFailureReason =
  | 'offline'
  | 'unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'invalid'
  | 'rejected'
  | 'rate_limited'
  | 'error';

export interface CatalogSuccess<T> {
  ok: true;
  data: T;
}
export interface CatalogFailure {
  ok: false;
  reason: CatalogFailureReason;
  message: string;
  code?: string;
  httpStatus?: number;
  flagReason?: string;
}
export type CatalogResult<T> = CatalogSuccess<T> | CatalogFailure;

/** Type guard: works regardless of the project's strictness settings. */
export const isOk = <T>(r: CatalogResult<T>): r is CatalogSuccess<T> => r.ok === true;

const DEFAULT_TIMEOUT_MS = 4000;
const UPLOAD_TIMEOUT_MS = 60000;

function reasonForStatus(status: number): CatalogFailureReason {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  if (status === 422) return 'rejected';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  if (status === 400 || status === 413 || status === 415 || status === 416) return 'invalid';
  return 'error';
}

async function call<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<CatalogResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { json, headers, ...rest } = init;
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: controller.signal,
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const contentType = res.headers.get('content-type') || '';
    // A dev/proxy HTML fallback (SPA index) means the API is not actually reachable.
    if (!contentType.includes('application/json')) {
      return { ok: false, reason: 'unavailable', message: 'The community service is not reachable.', httpStatus: res.status };
    }
    const body = await res.json();
    if (!res.ok) {
      const err = body as Partial<ApiErrorBody>;
      return {
        ok: false,
        reason: reasonForStatus(res.status),
        message: err.error || 'The community service could not complete that request.',
        code: err.code,
        httpStatus: res.status,
        flagReason: err.flagReason,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, reason: 'offline', message: 'The community service is offline.' };
  } finally {
    clearTimeout(timer);
  }
}

export const fetchCatalogHealth = async (): Promise<CatalogResult<CatalogHealth>> => {
  const res = await call<{ catalog?: CatalogHealth }>('/api/health');
  if (!isOk(res)) return res;
  return {
    ok: true,
    data: res.data.catalog ?? { enabled: false, driver: null, storage: null },
  };
};

/** Claims (or re-confirms) the creator handle and establishes the cookie session. */
export const ensureSession = async (handle: string): Promise<CatalogResult<CreatorProfile>> => {
  const res = await call<SessionResponse>('/api/session', { method: 'POST', json: { handle } });
  return isOk(res) ? { ok: true, data: res.data.profile } : res;
};

export const fetchSession = async (): Promise<CatalogResult<CreatorProfile>> => {
  const res = await call<SessionResponse>('/api/session');
  return isOk(res) ? { ok: true, data: res.data.profile } : res;
};

export const endSession = () => call<void>('/api/session', { method: 'DELETE' });

export const fetchPublishedCreations = async (limit = 50): Promise<CatalogResult<PublicCreation[]>> => {
  const res = await call<PublishedListResponse>(`/api/creations?limit=${limit}`);
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const fetchMyCreations = async (): Promise<CatalogResult<PublicCreation[]>> => {
  const res = await call<PublishedListResponse>('/api/creations?mine=1');
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const uploadCreation = (payload: CreateCreationRequest) =>
  call<CreationResponse>('/api/creations', { method: 'POST', json: payload }, UPLOAD_TIMEOUT_MS);

export const setCreationPublished = (id: string, isPublished: boolean) =>
  call<CreationResponse>(`/api/creations/${encodeURIComponent(id)}/publish`, {
    method: 'PATCH',
    json: { isPublished },
  });

export const deleteRemoteCreation = (id: string) =>
  call<void>(`/api/creations/${encodeURIComponent(id)}`, { method: 'DELETE' });

// --- Governance: reports, consent, provenance -------------------------------

/** Anyone may report a listed creation; the server de-duplicates per reporter. */
export const reportCreation = (id: string, payload: ReportRequest) =>
  call<{ received: boolean; flagged?: boolean }>(`/api/creations/${encodeURIComponent(id)}/reports`, {
    method: 'POST',
    json: payload,
  });

/** Withdraws consent for a creation and every remix of it (soft = undoable grace period). */
export const revokeConsent = (id: string, mode: RevocationMode) =>
  call<RevokeConsentResponse>(`/api/creations/${encodeURIComponent(id)}/revoke-consent`, {
    method: 'POST',
    json: { mode, cascade: 'descendants' } satisfies RevokeConsentRequest,
  });

export const restoreCreation = (id: string) =>
  call<{ restoredIds: string[] }>(`/api/creations/${encodeURIComponent(id)}/restore`, { method: 'POST', json: {} });

export const setRemixPermission = (id: string, remixPermitted: boolean) =>
  call<CreationResponse>(`/api/creations/${encodeURIComponent(id)}/remix-permission`, {
    method: 'PATCH',
    json: { remixPermitted },
  });

export const fetchLineage = (id: string) =>
  call<LineageResponse>(`/api/creations/${encodeURIComponent(id)}/lineage`);

// --- Distribution: shows, RSS feeds, schedules, webhooks, praise ------------

const enc = encodeURIComponent;

export interface ShowInput {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  language?: string;
  explicit?: boolean;
  slug?: string;
}

export const listShows = async (): Promise<CatalogResult<PublicShow[]>> => {
  const res = await call<{ items: PublicShow[] }>('/api/shows');
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const createShow = async (input: ShowInput): Promise<CatalogResult<PublicShow>> => {
  const res = await call<{ show: PublicShow }>('/api/shows', { method: 'POST', json: input });
  return isOk(res) ? { ok: true, data: res.data.show } : res;
};

export const deleteShow = (id: string) => call<void>(`/api/shows/${enc(id)}`, { method: 'DELETE' });

export const getShowSchedule = (id: string) => call<ShowScheduleResponse>(`/api/shows/${enc(id)}/schedule`);

export const putShowSchedule = (
  id: string,
  schedule: { dayOfWeek: number; timeOfDay: string; timezone: string; active?: boolean }
) => call<ShowScheduleResponse>(`/api/shows/${enc(id)}/schedule`, { method: 'PUT', json: schedule });

export const listEpisodes = async (showId: string): Promise<CatalogResult<EpisodeView[]>> => {
  const res = await call<{ items: EpisodeView[] }>(`/api/shows/${enc(showId)}/episodes`);
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const addEpisode = (showId: string, creationId: string) =>
  call<{ episode: EpisodeView }>(`/api/shows/${enc(showId)}/episodes/${enc(creationId)}`, { method: 'PUT', json: {} });

export const removeEpisode = (showId: string, creationId: string) =>
  call<void>(`/api/shows/${enc(showId)}/episodes/${enc(creationId)}`, { method: 'DELETE' });

/** Schedules at the show's next free weekly slot (`useSchedule`) or at an explicit instant. */
export const scheduleEpisode = (showId: string, creationId: string, when: { useSchedule: true } | { scheduledFor: string }) =>
  call<{ episode: EpisodeView }>(`/api/shows/${enc(showId)}/episodes/${enc(creationId)}/schedule`, {
    method: 'POST',
    json: when,
  });

export const unscheduleEpisode = (showId: string, creationId: string) =>
  call<void>(`/api/shows/${enc(showId)}/episodes/${enc(creationId)}/schedule`, { method: 'DELETE' });

export const publishEpisodeNow = (showId: string, creationId: string) =>
  call<{ episode: EpisodeView; published: boolean; reason: string | null }>(
    `/api/shows/${enc(showId)}/episodes/${enc(creationId)}/publish`,
    { method: 'POST', json: {} }
  );

export const listWebhooks = async (): Promise<CatalogResult<Array<Omit<WebhookEndpoint, 'creatorId'>>>> => {
  const res = await call<{ items: Array<Omit<WebhookEndpoint, 'creatorId'>> }>('/api/webhooks');
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const createWebhook = (url: string, events?: WebhookEvent[]) =>
  call<WebhookCreated>('/api/webhooks', { method: 'POST', json: { url, ...(events ? { events } : {}) } });

export const setWebhookActive = (id: string, active: boolean) =>
  call<unknown>(`/api/webhooks/${enc(id)}`, { method: 'PATCH', json: { active } });

export const deleteWebhook = (id: string) => call<void>(`/api/webhooks/${enc(id)}`, { method: 'DELETE' });

export const testWebhook = (id: string) =>
  call<{ deliveryId: string }>(`/api/webhooks/${enc(id)}/test`, { method: 'POST', json: {} });

export const listWebhookDeliveries = async (id: string): Promise<CatalogResult<WebhookDelivery[]>> => {
  const res = await call<{ items: WebhookDelivery[] }>(`/api/webhooks/${enc(id)}/deliveries`);
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const fetchPraise = async (creationId: string): Promise<CatalogResult<PublicPraise[]>> => {
  const res = await call<{ items: PublicPraise[] }>(`/api/creations/${enc(creationId)}/praise`);
  return isOk(res) ? { ok: true, data: res.data.items } : res;
};

export const sendPraise = (creationId: string, badge: PraiseBadge, message: string) =>
  call<{ praise: PublicPraise }>(`/api/creations/${enc(creationId)}/praise`, { method: 'POST', json: { badge, message } });

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Peak envelope (0..1) for the stored waveform; resolves null when decoding is unavailable. */
export async function computeWaveformJson(blob: Blob, points = 120): Promise<string | null> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const channel = decoded.getChannelData(0);
      const block = Math.max(1, Math.floor(channel.length / points));
      const peaks: number[] = [];
      for (let i = 0; i < points; i++) {
        let max = 0;
        const start = i * block;
        const end = Math.min(channel.length, start + block);
        const stride = Math.max(1, Math.floor((end - start) / 64));
        for (let j = start; j < end; j += stride) max = Math.max(max, Math.abs(channel[j]));
        peaks.push(Number(max.toFixed(3)));
      }
      const top = Math.max(...peaks, 0.001);
      return JSON.stringify(peaks.map((p) => Number((p / top).toFixed(3))));
    } finally {
      ctx.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
