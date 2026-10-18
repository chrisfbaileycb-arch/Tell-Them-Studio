/**
 * Shared Phase 3 contracts for creator sessions and the durable community catalog.
 * Imported by both the browser bundle and `src/server/**`, so it must stay free of
 * runtime code and of anything secret.
 */
import type { ContentOriginType } from '../../types';

export type ModerationStatus = 'pending' | 'flagged' | 'approved' | 'rejected';
export type RevocationMode = 'soft' | 'hard';
export type RevocationCause = 'owner' | 'ancestor' | 'moderation';
export type CreationKind = 'music' | 'podcast';

export interface CreatorProfile {
  id: string;
  /** Lower-case studio handle including the leading `@`. */
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface CreationRecord {
  id: string;
  creatorId: string;
  title: string;
  genre: string;
  /** Server-relative playback URL: `/api/creations/:id/audio`. */
  audioUrl: string;
  /** JSON-encoded array of normalised peak values (0..1), or null. */
  waveformJson: string | null;
  lyrics: string;
  isPublished: boolean;
  remixOfId: string | null;
  provenance: ContentOriginType;
  createdAt: string;
  updatedAt: string;
  kind: CreationKind;
  durationLabel: string | null;
  vocalArrangement: string | null;
  narratorInfo: string | null;
  /** Creator consent: may other creators publish remixes of this work? Enforced server-side. */
  remixPermitted: boolean;
  /** Top of the remix tree (the creation's own id for originals). */
  rootId: string | null;
  /** 0 for originals, parent depth + 1 for remixes. */
  remixDepth: number;
  /** Set when consent was withdrawn or moderation removed the work; hidden everywhere. */
  revokedAt: string | null;
  revokedBecause: RevocationCause | null;
}

export interface PublicationModeration {
  id: string;
  creationId: string;
  status: ModerationStatus;
  flagReason: string | null;
  reviewedAt: string | null;
}

/**
 * Public projection of a creation: never exposes the internal creator id or storage keys.
 * `clientRef` is only populated in the owner's own (`?mine=1`) listing, for local dedupe.
 */
export type PublicCreation = Omit<CreationRecord, 'creatorId'> & {
  creatorHandle: string;
  clientRef?: string | null;
  /** Mandatory attribution for remixes (parent project). */
  remixOf: RemixAttribution | null;
  /** Owner-only (`?mine=1`): why a publish request is being held, if it is. */
  moderationStatus?: ModerationStatus | null;
  moderationReason?: string | null;
};

export interface RemixAttribution {
  id: string;
  title: string;
  creatorHandle: string;
}

/** Server-only persisted shapes (never serialised to clients). */
export interface StoredCreator extends CreatorProfile {}
export interface StoredCreation extends CreationRecord {
  audioKey: string;
  audioMime: string;
  audioBytes: number;
  /** Client-supplied idempotency reference, unique per creator. */
  clientRef: string | null;
  /** sha256 of the audio bytes; revoked content is blocklisted by this hash. */
  contentHash: string;
  revocationMode: RevocationMode | null;
  /** Soft-revoked audio is hard-purged by a worker job after this instant. */
  purgeAfter: string | null;
  /** Key of the CDN-promoted public copy, present only while the item is publicly listed. */
  publicKey: string | null;
}

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

export interface SessionRequest {
  handle: string;
  displayName?: string;
}

export interface SessionResponse {
  profile: CreatorProfile;
}

export interface CreateCreationRequest {
  title: string;
  genre: string;
  lyrics?: string;
  provenance: ContentOriginType;
  kind?: CreationKind;
  durationLabel?: string;
  vocalArrangement?: string;
  narratorInfo?: string;
  remixOfId?: string | null;
  waveformJson?: string | null;
  /** Creator consent for remixes of this work. */
  remixPermitted?: boolean;
  /** Idempotency key (e.g. the local library/session id). */
  clientRef?: string;
  audioBase64: string;
  mimeType?: string;
}

export interface CreationResponse {
  creation: CreationRecord;
  moderation: PublicationModeration | null;
}

export type ReportReason = 'rights' | 'harassment' | 'pii' | 'unsafe' | 'other';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export interface ContentReport {
  id: string;
  creationId: string;
  /** Salted hash of the reporter's session or network address; never the raw value. */
  reporterKeyHash: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface ReportRequest {
  reason: ReportReason;
  details?: string;
}

export interface RevokeConsentRequest {
  mode: RevocationMode;
  /** Remix descendants are always hidden (consent chain); kept explicit for clients. */
  cascade?: 'descendants';
}

export interface RevokeConsentResponse {
  revokedIds: string[];
  mode: RevocationMode;
  purgeAfter: string | null;
}

export interface LineageResponse {
  ancestors: RemixAttribution[];
  remixes: RemixAttribution[];
}

export interface PublishRequest {
  isPublished: boolean;
}

export interface PublishedListResponse {
  items: PublicCreation[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  flagReason?: string;
}

export interface CatalogHealth {
  enabled: boolean;
  driver: string | null;
  storage: string | null;
  jobs?: { queued: number; leased: number; dead: number };
  moderation?: { classifier: string; adminEnabled: boolean };
  distribution?: { feeds: boolean; webhooks: { allowPrivateTargets: boolean } };
  cdn?: { enabled: boolean; baseUrl?: string };
}
