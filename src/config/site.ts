/**
 * Site identity used by the marketing and legal pages.
 *
 * Keep this file free of imports and browser/server APIs: it is loaded by the build
 * (vite.config.ts) as well as by the server.
 */
export const SITE = {
  name: 'Tell Them Studio',
  tagline: 'Tell them in a song.',
  description:
    'Turn a few words about someone or something you love into an original song, a two-host podcast or a radio spot. Clearly labeled as AI-made, and yours to share.',
  /** Shown as the og:image of every page that has no artwork of its own. */
  socialImage: '/images/og-default.jpg',

  /**
   * Legal identity and contact details. These are intentionally empty: fill them in, have the
   * legal pages reviewed, then set `reviewed` to true to remove the "draft" banner. Until then
   * the pages say plainly that they are drafts.
   */
  legal: {
    /** Registered name of the business operating the service, e.g. "Example Audio LLC". */
    entityName: '',
    /** Public contact address for support, privacy and rights requests. */
    contactEmail: '',
    /** Governing law, e.g. "the State of Ohio, USA". */
    governingLaw: '',
    reviewed: false,
    lastUpdated: 'November 10, 2026',
  },
};
