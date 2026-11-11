/**
 * Membership plans and credit costs.
 *
 * Single source of truth for the pricing page today and for billing and metering later. Nothing
 * here is on sale yet: see `PRICING_STATUS`. Change numbers here, not in page markup.
 *
 * Keep this file free of imports and browser/server APIs so it can be loaded from the build
 * (vite.config.ts), the browser and the server alike.
 */

export type PlanId = 'free' | 'creator' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** USD per month when billed monthly. */
  monthly: number;
  /** USD per year when billed annually; null when the plan has no annual option. */
  annual: number | null;
  /** Credits granted each month. */
  credits: number;
  features: string[];
  /** Visually emphasised on the pricing page. */
  recommended?: boolean;
}

/** What one render costs. A credit is roughly one short render; longer formats cost more. */
export const CREDIT_COSTS = [
  { id: 'clip', label: '30-second hook or jingle', credits: 1 },
  { id: 'commercial', label: 'Radio spot, 30 or 60 seconds', credits: 1 },
  { id: 'song', label: 'Full song', credits: 2 },
  { id: 'podcast', label: 'Podcast episode, 5 to 10 minutes', credits: 3 },
] as const;

export const SONG_CREDITS = 2;

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try every format and share what you make.',
    monthly: 0,
    annual: null,
    credits: 6,
    features: [
      'Songs, podcasts, radio spots and lyric videos',
      'Personal, non-commercial use',
      'Publish to the community showcase',
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    tagline: 'For people who make something most weeks.',
    monthly: 12,
    annual: 108,
    credits: 80,
    features: ['Everything in Free', 'Your library saved to your account', 'Top-up credits whenever you need them'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For shows, small businesses and organisations.',
    monthly: 29,
    annual: 264,
    credits: 250,
    recommended: true,
    features: ['Everything in Creator', 'Commercial-use licence', 'Podcast RSS feeds with weekly scheduling'],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For teams producing audio for several brands.',
    monthly: 79,
    annual: null,
    credits: 800,
    features: ['Everything in Pro', 'Multiple shows and brands', 'Team seats', 'Webhooks into your own systems'],
  },
];

/** One-time credit pack, no subscription. */
export const TOP_UP = { price: 8, credits: 40, validMonths: 12 };

/** Paid plans are announced but not purchasable until accounts and billing ship. */
export const PRICING_STATUS = {
  onSale: false,
  notice:
    'Preview pricing. Paid plans are not on sale yet. The studio is free to use during the preview, and plan details may change before launch.',
};

/** Whole-dollar monthly equivalent of the annual price, or null without an annual option. */
export const annualPerMonth = (plan: Plan): number | null => (plan.annual === null ? null : Math.round(plan.annual / 12));

/** Percentage saved by paying annually, rounded to a whole number. */
export const annualSaving = (plan: Plan): number =>
  plan.annual === null || plan.monthly === 0 ? 0 : Math.round((1 - plan.annual / (plan.monthly * 12)) * 100);

export const songsPerMonth = (plan: Plan): number => Math.floor(plan.credits / SONG_CREDITS);
