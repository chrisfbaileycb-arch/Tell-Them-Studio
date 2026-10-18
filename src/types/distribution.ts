/**
 * Phase 4 / Track B contracts: podcast shows, real feeds, outbound webhooks and inbound praise.
 * Shared by the browser bundle and `src/server/**`; must stay free of runtime code and secrets.
 */

export type EpisodePublishState = 'draft' | 'scheduled' | 'published';

/** A podcast show owned by a creator. `id` is the URL slug, which is globally unique. */
export interface Show {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  author: string;
  language: string;
  category: string;
  explicit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicShow extends Omit<Show, 'creatorId'> {
  creatorHandle: string;
  /** Absolute URL of the public RSS feed (the value to submit to podcast directories). */
  feedUrl: string;
  publishedEpisodes: number;
}

export interface ShowSchedule {
  showId: string;
  /** 0 = Sunday ... 6 = Saturday, in `timezone`. */
  dayOfWeek: number;
  /** 24h `HH:MM` in `timezone`. */
  timeOfDay: string;
  /** IANA zone, e.g. `America/Denver`. */
  timezone: string;
  active: boolean;
  updatedAt: string;
}

export interface ShowScheduleResponse {
  schedule: ShowSchedule | null;
  /** ISO instant of the next weekly slot, or null when there is no active schedule. */
  nextRunAt: string | null;
}

export interface EpisodeRecord {
  creationId: string;
  showId: string;
  publishState: EpisodePublishState;
  scheduledFor: string | null;
  publishedAt: string | null;
  episodeNumber: number;
  /** Why a due episode was kept as a draft (moderation), shown to the creator. */
  holdReason: string | null;
  createdAt: string;
}

export interface EpisodeView extends EpisodeRecord {
  title: string;
  moderationStatus: string | null;
}

export type WebhookEvent = 'creation.published' | 'creation.unpublished' | 'creation.revoked' | 'episode.published';
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'creation.published',
  'creation.unpublished',
  'creation.revoked',
  'episode.published',
];

export interface WebhookEndpoint {
  id: string;
  creatorId: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

/** Returned once at creation; the signing secret is never retrievable afterwards. */
export interface WebhookCreated {
  endpoint: Omit<WebhookEndpoint, 'creatorId'>;
  secret: string;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'dead';

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEvent | 'ping';
  status: DeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundSource {
  id: string;
  creatorId: string;
  label: string;
  createdAt: string;
}

export interface InboundSourceCreated {
  source: Omit<InboundSource, 'creatorId'>;
  /** HMAC secret for signing inbound praise payloads; shown once. */
  secret: string;
  url: string;
}

export type PraiseBadge =
  | 'Great Harmony'
  | 'Radio Ready'
  | 'Catchy Hook'
  | 'Clever Ad Craft'
  | 'Love Your Voice'
  | 'Question for Creator';
export const PRAISE_BADGES: PraiseBadge[] = [
  'Great Harmony',
  'Radio Ready',
  'Catchy Hook',
  'Clever Ad Craft',
  'Love Your Voice',
  'Question for Creator',
];

export interface Praise {
  id: string;
  creationId: string;
  /** `native` for in-studio praise, otherwise the inbound source id. */
  source: string;
  externalId: string;
  handle: string;
  badge: PraiseBadge;
  message: string;
  status: 'approved' | 'rejected';
  createdAt: string;
}

export interface PublicPraise {
  id: string;
  handle: string;
  badge: PraiseBadge;
  message: string;
  createdAt: string;
  source: string;
}

export interface DistributionHealth {
  feeds: boolean;
  webhooks: { allowPrivateTargets: boolean };
}
