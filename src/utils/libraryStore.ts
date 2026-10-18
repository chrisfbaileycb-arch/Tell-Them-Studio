import type { ContentOriginType } from "../../types";
import { createUniqueSongArtworkSvg } from "../../constants";
import type { PublicCreation } from "../types/community";
import {
  blobToBase64,
  CatalogFailure,
  CatalogResult,
  computeWaveformJson,
  deleteRemoteCreation,
  fetchMyCreations,
  isOk,
  restoreCreation,
  revokeConsent,
  setCreationPublished,
  setRemixPermission,
  uploadCreation,
} from "./catalogClient";
import { getCatalogSession, invalidateCatalogSession } from "./catalogSession";
import { readCreatorHandle } from "./creatorHandle";

export type LibrarySyncState = "local" | "synced" | "pending" | "failed";

export interface LibraryTrack {
  id: string;
  title: string;
  genre: string;
  kind: "music" | "podcast" | "commercial";
  audio: Blob;
  createdAt: string;
  visibility: "private" | "public";
  remixAllowed: boolean;
  source: "sample" | "upload" | "generated" | "mix";
  lyrics: string;
  owner: string;
  coverImageUrl?: string;
  /** Content origin disclosure carried to the live catalog. */
  provenance?: ContentOriginType;
  // --- Live-catalog sync metadata (all optional; absent for purely local tracks) ---
  /** Server-side creation id once uploaded. */
  remoteId?: string;
  /** Fingerprint of the content last uploaded, to detect edits that need re-upload. */
  remoteSignature?: string;
  /** Whether the server currently lists this track publicly. */
  remotePublished?: boolean;
  syncState?: LibrarySyncState;
  syncMessage?: string;
  /** Content+visibility fingerprint of a rejected attempt, so it is not retried unchanged. */
  syncFailedKey?: string;
  /** True while a publish request is held for review (flagged or pending moderation). */
  moderationHold?: boolean;
  /** Last remix permission confirmed on the server (absent = never confirmed, treated as false). */
  remoteRemixPermitted?: boolean;
  /** Set when consent was withdrawn (by the owner, a withdrawn original, or moderators). */
  consentWithdrawnAt?: string;
  consentWithdrawnBecause?: "owner" | "ancestor" | "moderation";
}

export type SyncPatch = Pick<
  LibraryTrack,
  | "remoteId"
  | "remoteSignature"
  | "remotePublished"
  | "syncState"
  | "syncMessage"
  | "syncFailedKey"
  | "moderationHold"
  | "remoteRemixPermitted"
>;

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("tell-them-library", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("tracks", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Check your privacy settings.",
        ),
      );
  });
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", mode),
      request = action(tx.objectStore("tracks"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Could not save to browser storage. It may be full or disabled.",
        ),
      );
    };
  });
}
export const loadLibrary = () =>
  transaction("readonly", (s) => s.getAll()) as Promise<LibraryTrack[]>;
export const saveTrack = (track: LibraryTrack) =>
  transaction("readwrite", (s) => s.put(track));
export const deleteTrack = (id: string) =>
  transaction("readwrite", (s) => s.delete(id));
const getTrack = (id: string) =>
  transaction("readonly", (s) => s.get(id)) as Promise<LibraryTrack | undefined>;

// ---------------------------------------------------------------------------
// Cache-and-network sync with the live catalog.
//
// IndexedDB stays the source of truth for the session and always succeeds first. Every
// network step below is best-effort: failures leave the track local (state "pending" when a
// retry is worthwhile) and never surface as exceptions.
// ---------------------------------------------------------------------------

const PENDING_DELETES_KEY = "tell-them-pending-remote-deletes";

/**
 * Only generated/sample audio is mirrored to the server. Imported audio and mixes stay in the
 * browser until a rights-confirmation flow exists, and commercials are excluded from the
 * community catalog by design.
 */
export const isCatalogSyncable = (t: LibraryTrack): boolean =>
  t.kind !== "commercial" && (t.source === "generated" || t.source === "sample");

const provenanceOf = (t: LibraryTrack): ContentOriginType =>
  t.provenance && t.provenance !== "Craft Commercial Spot"
    ? t.provenance
    : t.kind === "podcast"
      ? "AI Multi-Host Podcast"
      : "AI-Generated Material";

/** Content fingerprint (excludes visibility, which is synced as a separate publish step). */
export const trackSignature = (t: LibraryTrack): string =>
  [t.title, t.genre, t.kind, t.lyrics, provenanceOf(t), t.audio.size, t.audio.type].join("\u0001");

const attemptKey = (t: LibraryTrack) => `${trackSignature(t)}\u0002${t.visibility}`;

function failurePatch(base: Partial<SyncPatch>, f: CatalogFailure, key: string): SyncPatch {
  if (f.reason === "rejected") {
    return {
      ...base,
      syncState: "failed",
      syncMessage: f.flagReason || f.message,
      syncFailedKey: key,
    };
  }
  if (f.reason === "offline" || f.reason === "unavailable" || f.reason === "rate_limited" || f.reason === "error") {
    return { ...base, syncState: "pending", syncMessage: "Waiting for the live catalog. Saved in this browser." };
  }
  return { ...base, syncState: "local", syncMessage: f.message };
}

/** Runs `op`; on a 401 re-establishes the session once and retries. */
async function withSessionRetry<R extends CatalogResult<unknown>>(
  handle: string,
  op: () => Promise<R>,
): Promise<R> {
  let res = await op();
  if (!isOk(res) && res.reason === "unauthorized") {
    invalidateCatalogSession();
    const again = await getCatalogSession(handle);
    if (isOk(again)) res = await op();
  }
  return res;
}

/**
 * Brings one track up to date on the server (upload if new/changed, then publish/unpublish to
 * match its local visibility). Returns the sync metadata to merge, or null when not applicable
 * (not syncable, or owned by a handle other than the active one).
 */
export async function syncTrackToCatalog(track: LibraryTrack): Promise<SyncPatch | null> {
  if (!isCatalogSyncable(track) || track.owner !== readCreatorHandle()) return null;
  // Withdrawn consent is final for the client: never re-upload or re-publish withdrawn work.
  if (track.consentWithdrawnAt) return null;
  const session = await getCatalogSession(track.owner);
  const key = attemptKey(track);
  const base = (): Partial<SyncPatch> => ({
    remoteId: track.remoteId,
    remoteSignature: track.remoteSignature,
    remotePublished: track.remotePublished,
    remoteRemixPermitted: track.remoteRemixPermitted,
  });
  if (!isOk(session)) return failurePatch(base(), session, key);

  const signature = trackSignature(track);
  let remoteId = track.remoteId;
  let remoteSignature = track.remoteSignature;
  let remotePublished = track.remotePublished ?? false;
  let remoteRemix = track.remoteRemixPermitted ?? false;
  let held: string | null = null;
  const note = (m: { status: string; flagReason: string | null } | null | undefined) => {
    if (m && (m.status === "pending" || m.status === "flagged")) held = m.flagReason || "A moderator is reviewing it.";
  };

  if (!remoteId || remoteSignature !== signature) {
    let payload;
    try {
      payload = {
        title: track.title,
        genre: track.genre,
        lyrics: track.lyrics,
        provenance: provenanceOf(track),
        kind: track.kind === "podcast" ? ("podcast" as const) : ("music" as const),
        clientRef: track.id,
        remixPermitted: track.remixAllowed,
        waveformJson: await computeWaveformJson(track.audio),
        audioBase64: await blobToBase64(track.audio),
        mimeType: track.audio.type || undefined,
      };
    } catch {
      return { remoteId, remoteSignature, remotePublished, syncState: "local", syncMessage: "Could not read audio for upload." };
    }
    const up = await withSessionRetry(track.owner, () => uploadCreation(payload));
    if (!isOk(up)) return failurePatch(base(), up, key);
    remoteId = up.data.creation.id;
    remoteSignature = signature;
    remotePublished = up.data.creation.isPublished;
    remoteRemix = up.data.creation.remixPermitted;
    if (remotePublished) note(up.data.moderation);
  }

  const wantsPublic = track.visibility === "public";
  if (wantsPublic !== remotePublished) {
    const res = await withSessionRetry(track.owner, () => setCreationPublished(remoteId!, wantsPublic));
    if (!isOk(res)) return failurePatch({ ...base(), remoteId, remoteSignature, remotePublished, remoteRemixPermitted: remoteRemix }, res, key);
    remotePublished = res.data.creation.isPublished;
    if (remotePublished) note(res.data.moderation);
  }

  if (track.remixAllowed !== remoteRemix) {
    const res = await withSessionRetry(track.owner, () => setRemixPermission(remoteId!, track.remixAllowed));
    if (!isOk(res)) return failurePatch({ ...base(), remoteId, remoteSignature, remotePublished, remoteRemixPermitted: remoteRemix }, res, key);
    remoteRemix = res.data.creation.remixPermitted;
  }

  if (held) {
    // The creator's intent to publish is recorded server-side, but nothing is listed until a
    // moderator or the classifier clears it. Say so, and do not retry unchanged.
    return {
      remoteId,
      remoteSignature,
      remotePublished,
      remoteRemixPermitted: remoteRemix,
      moderationHold: true,
      syncState: "failed",
      syncMessage: `Awaiting review before it is listed: ${held}`,
      syncFailedKey: key,
    };
  }

  return {
    remoteId,
    remoteSignature,
    remotePublished,
    remoteRemixPermitted: remoteRemix,
    moderationHold: false,
    syncFailedKey: undefined,
    syncState: "synced",
    syncMessage: remotePublished
      ? "Published to the live catalog."
      : "Backed up to your live catalog account (private).",
  };
}

/**
 * Merges sync metadata into the *current* stored track, so edits made while a network call was
 * in flight are never overwritten. If the track was deleted meanwhile, the upload is revoked.
 */
export async function commitSyncPatch(id: string, patch: SyncPatch): Promise<LibraryTrack | null> {
  const current = await getTrack(id);
  if (!current) {
    if (patch.remoteId) void deleteRemoteOrQueue(patch.remoteId, readCreatorHandle());
    return null;
  }
  const next = { ...current, ...patch };
  await saveTrack(next);
  return next;
}

// --- remote deletes with an offline tombstone queue -------------------------

interface PendingDelete {
  remoteId: string;
  owner: string;
}

function readPendingDeletes(): PendingDelete[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingDeletes(list: PendingDelete[]) {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the delete is retried only if the tombstone survives */
  }
}

async function deleteRemoteOrQueue(remoteId: string, owner: string): Promise<boolean> {
  if (owner === readCreatorHandle()) {
    const session = await getCatalogSession(owner);
    if (isOk(session)) {
      const res = await withSessionRetry(owner, () => deleteRemoteCreation(remoteId));
      if (isOk(res) || res.httpStatus === 404) return true;
      if (res.httpStatus === 403) return true; // not ours (any more): nothing to revoke
    }
  }
  const queue = readPendingDeletes();
  if (!queue.some((p) => p.remoteId === remoteId)) writePendingDeletes([...queue, { remoteId, owner }]);
  return false;
}

/**
 * Revokes the server copy of a track that was already deleted locally (or queues the revocation
 * for the next successful sync). Resolves true when the server copy is gone.
 */
export function revokeRemoteCopy(track: LibraryTrack): Promise<boolean> {
  return track.remoteId ? deleteRemoteOrQueue(track.remoteId, track.owner) : Promise.resolve(true);
}

async function flushPendingDeletes(): Promise<void> {
  const handle = readCreatorHandle();
  const queue = readPendingDeletes();
  if (!queue.length) return;
  const remaining: PendingDelete[] = [];
  for (const item of queue) {
    if (item.owner !== handle) {
      remaining.push(item);
      continue;
    }
    const done = await deleteRemoteOrQueueNoRequeue(item);
    if (!done) remaining.push(item);
  }
  writePendingDeletes(remaining);
}

async function deleteRemoteOrQueueNoRequeue(item: PendingDelete): Promise<boolean> {
  const session = await getCatalogSession(item.owner);
  if (!isOk(session)) return false;
  const res = await withSessionRetry(item.owner, () => deleteRemoteCreation(item.remoteId));
  return isOk(res) || res.httpStatus === 404 || res.httpStatus === 403;
}

// --- consent withdrawal ------------------------------------------------------

function consentMessage(cause: "owner" | "ancestor" | "moderation" | null | undefined, reason?: string | null): string {
  if (cause === "ancestor") return "Withdrawn: the original this remixes was taken down by its creator.";
  if (cause === "moderation") return `Removed by moderators${reason ? `: ${reason}` : "."}`;
  return "Consent withdrawn: removed from the live catalog.";
}

export interface ConsentResult {
  ok: boolean;
  message: string;
  /** Soft revocations can be undone until this instant. */
  purgeAfter?: string | null;
  affected?: number;
}

/**
 * Withdraws consent for a track on the server (and for every remix of it). `soft` keeps the audio
 * for a grace period so the creator can undo it; `hard` erases it immediately. The local copy is
 * kept (it is the creator's own file) but is marked and never re-published.
 */
export async function withdrawConsent(track: LibraryTrack, mode: "soft" | "hard"): Promise<ConsentResult> {
  if (!track.remoteId) return { ok: false, message: "This track was never shared, so there is nothing to withdraw." };
  const session = await getCatalogSession(track.owner);
  if (!isOk(session)) return { ok: false, message: session.message };
  const res = await withSessionRetry(track.owner, () => revokeConsent(track.remoteId!, mode));
  if (!isOk(res)) return { ok: false, message: res.message };
  await commitSyncPatch(track.id, {
    remoteId: track.remoteId,
    remoteSignature: track.remoteSignature,
    remotePublished: false,
    remoteRemixPermitted: track.remoteRemixPermitted,
    moderationHold: false,
    syncFailedKey: undefined,
    syncState: "local",
    syncMessage:
      mode === "hard"
        ? "Consent withdrawn: the server copy and all remixes were erased."
        : "Consent withdrawn: hidden everywhere. You can undo this until the grace period ends.",
  }).catch(() => null);
  const current = await getTrack(track.id).catch(() => undefined);
  if (current) {
    await saveTrack({
      ...current,
      visibility: "private",
      consentWithdrawnAt: new Date().toISOString(),
      consentWithdrawnBecause: "owner",
    }).catch(() => undefined);
  }
  return {
    ok: true,
    purgeAfter: res.data.purgeAfter,
    affected: res.data.revokedIds.length,
    message:
      mode === "hard"
        ? `Erased ${res.data.revokedIds.length} item(s) from the live catalog.`
        : `Hidden ${res.data.revokedIds.length} item(s). Undo is available until ${res.data.purgeAfter ?? "the grace period ends"}.`,
  };
}

/** Undoes a soft withdrawal inside its grace period. The work returns private. */
export async function undoWithdrawal(track: LibraryTrack): Promise<ConsentResult> {
  if (!track.remoteId) return { ok: false, message: "Nothing to restore." };
  const session = await getCatalogSession(track.owner);
  if (!isOk(session)) return { ok: false, message: session.message };
  const res = await withSessionRetry(track.owner, () => restoreCreation(track.remoteId!));
  if (!isOk(res)) return { ok: false, message: res.message };
  const current = await getTrack(track.id).catch(() => undefined);
  if (current) {
    await saveTrack({
      ...current,
      visibility: "private",
      remotePublished: false,
      consentWithdrawnAt: undefined,
      consentWithdrawnBecause: undefined,
      syncState: "synced",
      syncMessage: "Consent restored. The work is private again; publish it to list it.",
    }).catch(() => undefined);
  }
  return { ok: true, message: "Restored. Publish it again to list it publicly.", affected: res.data.restoredIds.length };
}

// --- pulling the server library back into the browser ----------------------

async function restoreFromRemote(item: PublicCreation): Promise<LibraryTrack | null> {
  try {
    const res = await fetch(item.audioUrl, { credentials: "same-origin" });
    if (!res.ok) return null;
    const audio = await res.blob();
    const id = item.clientRef || item.id;
    const track: LibraryTrack = {
      id,
      title: item.title,
      genre: item.genre,
      kind: item.kind,
      audio,
      createdAt: item.createdAt,
      visibility: item.isPublished ? "public" : "private",
      remixAllowed: item.remixPermitted,
      remoteRemixPermitted: item.remixPermitted,
      source: "generated",
      lyrics: item.lyrics,
      owner: item.creatorHandle,
      provenance: item.provenance,
      coverImageUrl: createUniqueSongArtworkSvg({
        title: item.title,
        genre: item.genre,
        lyrics: item.lyrics,
        creatorHandle: item.creatorHandle,
        seed: id,
        motif: item.kind === "podcast" ? "podcast" : "band",
      }),
      remoteId: item.id,
      remotePublished: item.isPublished,
      syncState: "synced",
      syncMessage: "Restored from your live catalog account.",
    };
    track.remoteSignature = trackSignature(track);
    return track;
  } catch {
    return null;
  }
}

/**
 * Full cache-and-network pass for the active creator:
 *  1. retries queued remote deletes,
 *  2. pushes local tracks that are new/changed/unpublished-vs-published,
 *  3. restores server-only tracks (e.g. created on another device) into IndexedDB.
 * Returns the refreshed local library. Never throws; offline simply returns the local cache.
 */
export async function syncLibrary(initial?: LibraryTrack[]): Promise<LibraryTrack[]> {
  let tracks = initial ?? (await loadLibrary().catch(() => [] as LibraryTrack[]));
  const handle = readCreatorHandle();
  try {
    const session = await getCatalogSession(handle);
    if (!isOk(session)) return tracks;

    await flushPendingDeletes();

    for (const track of tracks) {
      if (track.owner !== handle || !isCatalogSyncable(track) || track.consentWithdrawnAt) continue;
      const needsWork =
        !track.remoteId ||
        track.remoteSignature !== trackSignature(track) ||
        (track.visibility === "public") !== Boolean(track.remotePublished) ||
        track.remixAllowed !== Boolean(track.remoteRemixPermitted) ||
        track.syncState === "pending";
      if (!needsWork) continue;
      // A moderation-rejected attempt is not retried until the content or visibility changes.
      if (track.syncState === "failed" && track.syncFailedKey === attemptKey(track)) continue;
      const patch = await syncTrackToCatalog(track);
      if (patch) await commitSyncPatch(track.id, patch).catch(() => null);
    }

    const mine = await fetchMyCreations();
    if (isOk(mine)) {
      const pendingDeleteIds = new Set(readPendingDeletes().map((p) => p.remoteId));
      tracks = await loadLibrary();
      for (const item of mine.data) {
        if (pendingDeleteIds.has(item.id)) continue;
        const match = tracks.find((t) => t.remoteId === item.id || t.id === item.clientRef);
        if (item.revokedAt) {
          // Consent withdrawn (by the owner, a withdrawn original, or moderators): the server no
          // longer serves this work, so it is never restored and the local copy is marked.
          if (match && !match.consentWithdrawnAt) {
            await saveTrack({
              ...match,
              remoteId: item.id,
              remotePublished: false,
              visibility: "private",
              moderationHold: false,
              consentWithdrawnAt: item.revokedAt,
              consentWithdrawnBecause: item.revokedBecause ?? "owner",
              syncState: "local",
              syncMessage: consentMessage(item.revokedBecause, item.moderationReason),
              syncFailedKey: undefined,
            }).catch(() => undefined);
          }
          continue;
        }
        if (match) {
          const held = item.isPublished && (item.moderationStatus === "pending" || item.moderationStatus === "flagged");
          const cleared = match.moderationHold && item.isPublished && item.moderationStatus === "approved";
          const restoredByOwner = Boolean(match.consentWithdrawnAt);
          const changed =
            match.remotePublished !== item.isPublished ||
            match.remoteId !== item.id ||
            match.remoteRemixPermitted !== item.remixPermitted ||
            cleared ||
            restoredByOwner ||
            (held && !match.moderationHold);
          if (changed) {
            const next: LibraryTrack = {
              ...match,
              remoteId: item.id,
              remotePublished: item.isPublished,
              remoteRemixPermitted: item.remixPermitted,
            };
            if (restoredByOwner) {
              next.consentWithdrawnAt = undefined;
              next.consentWithdrawnBecause = undefined;
              next.visibility = "private";
              next.remotePublished = false;
              next.syncState = "synced";
              next.syncMessage = "Consent restored. The work is private again; publish it to list it.";
            } else if (cleared) {
              next.moderationHold = false;
              next.syncState = "synced";
              next.syncFailedKey = undefined;
              next.syncMessage = "Published to the live catalog.";
            } else if (held) {
              next.moderationHold = true;
              next.syncState = "failed";
              next.syncFailedKey = attemptKey(match);
              next.syncMessage = `Awaiting review before it is listed: ${item.moderationReason || "A moderator is reviewing it."}`;
            }
            await saveTrack(next).catch(() => undefined);
          }
          continue;
        }
        const restored = await restoreFromRemote(item);
        if (restored) await saveTrack(restored).catch(() => undefined);
      }
    }
  } catch {
    /* fall through to the local cache */
  }
  return loadLibrary().catch(() => tracks);
}
