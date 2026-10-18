export interface DistributionConfig {
  /**
   * Public origin used for absolute URLs in feeds and webhook payloads. Strongly recommended in
   * production; without it the request's own Host header is used for feeds.
   */
  publicBaseUrl?: string;
  /** Test/dev only: allow http:// and private/loopback webhook targets. Off by default. */
  allowPrivateWebhookTargets: boolean;
  webhookMaxAttempts: number;
  webhookTimeoutMs: number;
}

export const DEFAULT_DISTRIBUTION: DistributionConfig = {
  allowPrivateWebhookTargets: false,
  webhookMaxAttempts: 8,
  webhookTimeoutMs: 10_000,
};
