/**
 * Global Constants, SVG Artwork Generators, and Curated Radio/Band/Holiday Data
 */
import React from 'react';
import {
  BandArchetype,
  ExampleSong,
  HolidayTemplate,
  RadioStation,
  SongResult,
  VocalArrangement,
} from './types';

/**
 * Generates a crisp, zero-broken-image SVG Data URI cover art with custom colors and motifs.
 */
export const createStudioCoverSvg = (
  bgStart: string,
  bgEnd: string,
  accent: string,
  motif: 'band' | 'podcast' | 'commercial' | 'halloween' | 'christmas' | 'radio'
): string => {
  const motifShapes = {
    band: `
      <circle cx="200" cy="200" r="130" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.35" />
      <circle cx="200" cy="200" r="95" fill="none" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.25" />
      <circle cx="200" cy="200" r="36" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-width="2" />
      <circle cx="200" cy="200" r="10" fill="#ffffff" />
      <path d="M90 310 L150 250 L200 285 L260 220 L310 270" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
    `,
    podcast: `
      <rect x="165" y="95" width="70" height="120" rx="35" fill="none" stroke="#ffffff" stroke-width="5" />
      <path d="M135 160 A65 65 0 0 0 265 160" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" />
      <line x1="200" y1="225" x2="200" y2="285" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
      <line x1="155" y1="285" x2="245" y2="285" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    `,
    commercial: `
      <polygon points="110,175 185,140 185,260 110,225" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" />
      <path d="M185 140 L275 95 L275 305 L185 260 Z" fill="${accent}" fill-opacity="0.25" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" />
      <path d="M300 155 Q330 200 300 245" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" />
    `,
    halloween: `
      <circle cx="200" cy="195" r="105" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="3" />
      <polygon points="155,165 175,140 190,170" fill="#ffffff" />
      <polygon points="245,165 225,140 210,170" fill="#ffffff" />
      <path d="M145 225 L168 242 L188 225 L200 242 L215 225 L235 242 L255 225" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    `,
    christmas: `
      <polygon points="200,80 125,205 165,205 110,290 290,290 235,205 275,205" fill="${accent}" fill-opacity="0.28" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" />
      <circle cx="200" cy="68" r="12" fill="#ffffff" />
      <circle cx="175" cy="185" r="6" fill="#ffffff" />
      <circle cx="222" cy="240" r="6" fill="${accent}" />
    `,
    radio: `
      <circle cx="200" cy="160" r="14" fill="#ffffff" />
      <path d="M155 125 A65 65 0 0 1 245 125" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" />
      <path d="M125 95 A105 105 0 0 1 275 95" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" />
      <polygon points="200,175 145,310 255,310" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" />
      <line x1="165" y1="245" x2="235" y2="245" stroke="${accent}" stroke-width="3" />
    `,
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)" />
    <circle cx="340" cy="60" r="140" fill="${accent}" fill-opacity="0.15" />
    <circle cx="60" cy="340" r="160" fill="#ffffff" fill-opacity="0.06" />
    ${motifShapes[motif]}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const BAND_ARCHETYPES: {
  id: BandArchetype;
  label: string;
  tagline: string;
  defaultVocals: VocalArrangement;
  instruments: string;
}[] = [
  {
    id: 'Rock Band',
    label: 'Rock Band',
    tagline: 'Dual lead vocals, overdriven rhythm & lead guitars, punchy bass, live studio drums',
    defaultVocals: 'Multi-Singer Trade-Off (Male & Female)',
    instruments: 'Twin electric guitars, tube bass amp, live drum kit, multi-singer stadium harmonies',
  },
  {
    id: 'Country Band',
    label: 'Country Band',
    tagline: 'Male & female duet vocals, acoustic flattop, pedal steel, fiddle, warm upright groove',
    defaultVocals: 'Multi-Singer Trade-Off (Male & Female)',
    instruments: 'Acoustic guitar, telecaster twang, pedal steel, fiddle, warm harmonies',
  },
  {
    id: 'Pop Band',
    label: 'Pop Band',
    tagline: 'Multi-singer vocal group with call-and-response hooks, tight synth-bass & crisp percussion',
    defaultVocals: '3-Part Band Harmonies',
    instruments: 'Layered multi-singer vocals, funky rhythm guitar, analog synth bass, crisp drums',
  },
  {
    id: 'Disco Band',
    label: 'Disco Band',
    tagline: 'Four-on-the-floor groove, horn section, slap bass, and euphoric group chorus vocals',
    defaultVocals: '3-Part Band Harmonies',
    instruments: 'Disco strings, brass horn section, rhythm guitar Nile-style chucking, group vocals',
  },
  {
    id: 'Custom Genre',
    label: 'Custom Genre Blend',
    tagline: 'Define your own signature genre fusion and custom vocal lineup',
    defaultVocals: 'Multi-Singer Trade-Off (Male & Female)',
    instruments: 'Custom user-specified instrumentation and vocal interplay',
  },
  {
    id: 'Singer-Free Instrumental',
    label: 'Singer-Free (Backing Band)',
    tagline: 'Pure instrumental band arrangement designed for you to sing over or promote your own voice',
    defaultVocals: 'Singer-Free (Record Your Own Voice)',
    instruments: 'Full live band backing mix with vocal pocket headroom for human singers',
  },
];

export const VOCAL_ARRANGEMENTS: VocalArrangement[] = [
  'Multi-Singer Trade-Off (Male & Female)',
  '3-Part Band Harmonies',
  'Dual Female Lead & Harmony',
  'Dual Male Lead & Harmony',
  'Lead Female + Band Backing',
  'Lead Male + Band Backing',
  'Singer-Free (Record Your Own Voice)',
];

export const PROMPT_HELPER_CONFIG = {
  moods: [
    'Upbeat & Anthemic',
    'Groovy & Danceable',
    'Feel-Good Roadtrip',
    'High-Energy Stadium',
    'Warm & Nostalgic',
    'Soulful & Uplifting',
    'Funky & Electric',
    'Festive & Bright',
    'Bold & Driving',
    'Cozy & Acoustic',
  ],
  genders: [
    'Rock Band (Multi-Singer)',
    'Country Band (Duet Harmonies)',
    'Pop Group (Trade-Off Vocals)',
    'Disco Band (Full Horn & Vocal Ensemble)',
    'Americana Roots Band',
    'Indie Pop-Rock Band',
    'Funk & Soul Band',
    'Singer-Free Backing Band',
  ],
  themes: [
    'Friday Night Hometown Game (Original Black & Gold Pride)',
    'Saturday Night Roller Disco Fever',
    'Cross-Country Highway Sunset',
    'Small Town Summer Festival',
    'Halloween Costume Party Showdown',
    'Cozy Snowfall & Holiday Lights',
    'Chasing a Big Dream Together',
    'Coffee Shop Morning Jam',
  ],
  timestamps: ['0:15', '0:30', '0:45', '1:00', '1:30', '2:00', '2:15'],
  bpms: ['96 BPM', '108 BPM', '118 BPM', '124 BPM', '132 BPM', '145 BPM'],
  scales: ['C Major', 'G Major', 'D Major', 'A Minor', 'E Minor', 'F Major', 'Mixolydian Groove'],
};

export const INITIAL_COMMUNITY_SONGS: SongResult[] = [
  {
    id: 'seed-band-1',
    itemType: 'song',
    status: 'completed',
    logs: [
      '[Studio] Multi-singer Rock Band lineup initialized (2:48 Max Radio Cap).',
      '[Safety & IP] Original hometown sports pride lyrics verified—zero trademark infringement.',
      '[AI Identifier] Tagged as AI-Generated Material in respect of human artists.',
    ],
    audioUrl: null,
    coverImageUrl: createStudioCoverSvg('#1e1b4b', '#7f1d1d', '#f59e0b', 'band'),
    title: 'Steel City Gold & Black',
    creatorHandle: '@riverfront_rockers',
    bandType: 'Rock Band',
    vocalArrangement: 'Multi-Singer Trade-Off (Male & Female)',
    originType: 'AI-Generated Material',
    lyrics: `[0:00] (Male Lead) Under the Friday river lights, hear the bridges hum\n[0:18] (Female Lead) Three rivers rising up, the weekend has begun!\n[0:36] (Full Band Chorus) Wave the gold and black tonight, standing shoulder to shoulder\n[1:05] (Dual Guitar Solo & Band Chant) Here we go, steel and heart, never backing down!\n[2:10] (All Singers Harmony) From the north shore to the hill, this city owns the crown!`,
    metadata: 'Rock Band · 128 BPM · G Major · 2:48 Radio Master',
    fullPrompt:
      'Create an upbeat & anthemic Rock Band (Multi-Singer) song about Friday Night Hometown Game (Original Black & Gold Pride) featuring Multi-Singer Trade-Off (Male & Female) vocals, capped at 2 minutes and 48 seconds.',
    error: null,
    duration: '2:48 Radio Master (Max)',
    maxCapLabel: '2:42 / 2:48 MAX',
    timestamp: new Date(Date.now() - 3600 * 1000 * 5),
    isExpanded: false,
    thumbsUp: 48,
    publishedPlatforms: ['Spotify', 'YouTube', 'Amazon Music'],
    praiseList: [
      {
        id: 'p1',
        handle: '@melody_maker_88',
        badge: 'Great Harmony',
        message: 'Love how the male and female rock vocals trade lines before the big stadium chorus! Super smart way to do a city football anthem with 100% original lyrics.',
        timestamp: '2h ago',
      },
      {
        id: 'p2',
        handle: '@nashville_chord',
        badge: 'Question for Creator',
        message: 'Did you use the 128 BPM setting for the transition into the bridge? Sounds awesome on our station!',
        timestamp: '1h ago',
      },
    ],
    originalPrompt: 'Upbeat Rock Band anthem with male & female trade-off vocals about hometown black and gold game day pride.',
    originalDuration: '2:48 Radio Master (Max)',
    originalLyricsOption: 'Auto',
  },
  {
    id: 'seed-band-2',
    itemType: 'song',
    status: 'completed',
    logs: [
      '[Studio] Disco Band 3-Part Vocal Ensemble synthesized.',
      '[Human + AI] Creator layered live tambourine & lead vocal hook over backing band.',
    ],
    audioUrl: null,
    coverImageUrl: createStudioCoverSvg('#3b0764', '#9d174d', '#38bdf8', 'band'),
    title: 'Starlight Roller Boogie',
    creatorHandle: '@velvet_groove_fm',
    bandType: 'Disco Band',
    vocalArrangement: '3-Part Band Harmonies',
    originType: 'Human Voice + AI Backing Band',
    lyrics: `[0:00] (3-Part Harmony) Lace up the skates, let the mirrorball spin\n[0:24] (Lead Vocal) Brass section kicking in, let the weekend begin\n[0:55] (Band Call & Response) Glide to the left (keep it bright!), groove to the right\n[1:45] (Horn Breakdown & Chorus) Two minutes forty-eight of pure Saturday night!`,
    metadata: 'Disco Band · 120 BPM · F Major · 2:38 Radio Master',
    fullPrompt:
      'Create a groovy Disco Band song with 3-Part Band Harmonies, live brass horns, slap bass, and funky guitar.',
    error: null,
    duration: '2:48 Radio Master (Max)',
    maxCapLabel: '2:38 / 2:48 MAX',
    timestamp: new Date(Date.now() - 3600 * 1000 * 12),
    isExpanded: false,
    thumbsUp: 63,
    publishedPlatforms: ['Spotify', 'Amazon Music'],
    praiseList: [
      {
        id: 'p3',
        handle: '@sunny_pop_collective',
        badge: 'Love Your Voice',
        message: 'Using the instrumental band mode to layer your own lead vocal on top of the disco horns is inspiring!',
        timestamp: '4h ago',
      },
    ],
    originalPrompt: 'Groovy Disco Band with 3-part harmonies and brass section.',
    originalDuration: '2:48 Radio Master (Max)',
    originalLyricsOption: 'Auto',
  },
];

export const INITIAL_RADIO_STATIONS: RadioStation[] = [
  {
    id: 'station-1',
    name: ' Neon Highway Band Radio',
    callSign: 'WTTB 104.5',
    creatorHandle: '@riverfront_rockers',
    tagline: '2:48 max multi-singer rock, country & disco band hits + weekly 7-min creator spotlights.',
    genreFocus: 'Rock Bands · Country Duets · Disco Ensembles',
    coverSvgUrl: createStudioCoverSvg('#0f172a', '#1e3a8a', '#38bdf8', 'radio'),
    listenersCount: 342,
    thumbsUp: 129,
    syndicatedTo: ['Spotify', 'YouTube', 'Amazon Music'],
    trackIds: ['seed-band-1', 'seed-band-2'],
    praiseComments: [
      {
        id: 'sp1',
        handle: '@acoustic_horizon',
        badge: 'Radio Ready',
        message: 'The 2:48 song cap keeps this station moving so well—every track hits the hook right away.',
        timestamp: '3h ago',
      },
    ],
  },
  {
    id: 'station-2',
    name: 'Holiday & Hometown Waves',
    callSign: 'KHOL 98.9',
    creatorHandle: '@seasonal_soundsmith',
    tagline: 'Spooky October surf-rock bands transitioning into warm Christmas country & pop ensembles.',
    genreFocus: 'Halloween Rock · Christmas Bands · Family-Safe Ads',
    coverSvgUrl: createStudioCoverSvg('#431407', '#7c2d12', '#fb923c', 'halloween'),
    listenersCount: 218,
    thumbsUp: 94,
    syndicatedTo: ['Spotify', 'YouTube'],
    trackIds: ['seed-band-1'],
    praiseComments: [
      {
        id: 'sp2',
        handle: '@indie_spark',
        badge: 'Great Harmony',
        message: 'Awesome seasonal programming! Can’t wait to submit our Christmas duet next week.',
        timestamp: '5h ago',
      },
    ],
  },
];

export const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  {
    id: 'hol-halloween-1',
    holiday: 'Halloween (Last-Minute Blitz)',
    title: 'Midnight Pumpkin Surf-Rock Band',
    bandType: 'Rock Band',
    vocalArrangement: 'Multi-Singer Trade-Off (Male & Female)',
    duration: '2:48 Radio Master (Max)',
    countdownNote: 'October 13 — Final 18 Days for Halloween Radio Rotation!',
    coverSvgUrl: createStudioCoverSvg('#18181b', '#7c2d12', '#f97316', 'halloween'),
    prompt:
      'Create an upbeat, playful retro surf-rock and garage pop band song for a family-friendly Halloween party. Feature male and female singers trading spooky-fun verses with a catchy group chorus, twangy reverb guitars, and vibrant organ.',
    suggestedLyrics: `[0:00] (Male Vocal) Jack-o'-lanterns glowing on the front porch stair\n[0:15] (Female Vocal) Crisp October breeze in the autumn air\n[0:30] (Full Band Chorus) Do the Monster Street Strut, everybody join the band!\n[1:15] (Guitar & Organ Break) Candy corn rhythm across the land!`,
  },
  {
    id: 'hol-halloween-2',
    holiday: 'Halloween (Last-Minute Blitz)',
    title: 'Haunted Mirrorball Disco Ensemble',
    bandType: 'Disco Band',
    vocalArrangement: '3-Part Band Harmonies',
    duration: '2:48 Radio Master (Max)',
    countdownNote: 'October 13 — Ready for Weekend Halloween Playlists',
    coverSvgUrl: createStudioCoverSvg('#2e1065', '#701a75', '#c084fc', 'halloween'),
    prompt:
      'Create a groovy 122 BPM Disco Band Halloween track with 3-part vocal harmonies, funky bassline, brass stabs, and playful costume-party energy. Strictly family-safe and radio-ready under 2:48.',
    suggestedLyrics: `[0:00] (3-Part Harmony) Sequins and capes underneath the strobe light\n[0:22] (Lead & Backing) Every friendly ghost is dancing tonight\n[0:45] (Chorus) Boogie on the cobwebs, spin around the floor!`,
  },
  {
    id: 'hol-christmas-1',
    holiday: 'Christmas (Early-Bird Prep)',
    title: 'Sleigh Bell Country-Pop Duet',
    bandType: 'Country Band',
    vocalArrangement: 'Multi-Singer Trade-Off (Male & Female)',
    duration: '2:48 Radio Master (Max)',
    countdownNote: 'Early-Bird Workshop — Prep Now for Nov/Dec Spotify & Amazon Release',
    coverSvgUrl: createStudioCoverSvg('#064e3b', '#7f1d1d', '#fcd34d', 'christmas'),
    prompt:
      'Create a warm, uplifting Country Band Christmas song with male and female duet vocals, acoustic guitars, sleigh bells, pedal steel, and a joyful full-band chorus about coming home for the holidays.',
    suggestedLyrics: `[0:00] (Female Vocal) Stringing up the pine boughs by the window pane\n[0:18] (Male Vocal) Headlights pulling up through the snowy lane\n[0:38] (Full Band Duet Chorus) Cinnamon and evergreens, singing by the firelight!`,
  },
  {
    id: 'hol-christmas-2',
    holiday: 'Christmas (Early-Bird Prep)',
    title: 'Snowflake Pop Band Harmony Special',
    bandType: 'Pop Band',
    vocalArrangement: '3-Part Band Harmonies',
    duration: '2:48 Radio Master (Max)',
    countdownNote: 'Early-Bird Workshop — Ideal for Holiday Radio Station Rotation',
    coverSvgUrl: createStudioCoverSvg('#1e3a8a', '#0f172a', '#38bdf8', 'christmas'),
    prompt:
      'Create a bright, modern upbeat Pop Band holiday anthem with multi-singer 3-part harmonies, chimes, warm piano, punchy drums, and a celebratory winter chorus.',
    suggestedLyrics: `[0:00] (Group Harmony) First frost on the boulevard, scarves of red and gold\n[0:25] (Lead Trade-Off) Best time of the year is about to unfold!`,
  },
];

export const WEEKLY_TRENDING_GENRES = [
  {
    genre: 'Rock Band (Multi-Singer)',
    tracksCreated: 428,
    thumbsUp: 1940,
    stationSpins: 3120,
    humanVocalShare: 38,
    topVocalLineup: 'Male & Female Trade-Off',
  },
  {
    genre: 'Country Band (Duet)',
    tracksCreated: 365,
    thumbsUp: 1680,
    stationSpins: 2740,
    humanVocalShare: 44,
    topVocalLineup: 'Male & Female Duet',
  },
  {
    genre: 'Disco Band (Ensemble)',
    tracksCreated: 312,
    thumbsUp: 1520,
    stationSpins: 2490,
    humanVocalShare: 29,
    topVocalLineup: '3-Part Band Harmonies',
  },
  {
    genre: 'Pop Group (Trade-Off)',
    tracksCreated: 289,
    thumbsUp: 1390,
    stationSpins: 2210,
    humanVocalShare: 34,
    topVocalLineup: '3-Part Band Harmonies',
  },
  {
    genre: 'Singer-Free Backing',
    tracksCreated: 246,
    thumbsUp: 1210,
    stationSpins: 1850,
    humanVocalShare: 100,
    topVocalLineup: 'Live Creator Voice Overdub',
  },
  {
    genre: 'Custom Brass-Rock',
    tracksCreated: 174,
    thumbsUp: 890,
    stationSpins: 1340,
    humanVocalShare: 31,
    topVocalLineup: 'Dual Lead & Horn Section',
  },
];

export const WEEKLY_TRENDING_THEMES = [
  {
    theme: 'Hometown Football Pride',
    tracks: 392,
    praiseCount: 1480,
    syndicatedPercent: 84,
    category: 'Sports & City Spirit',
  },
  {
    theme: 'Halloween Costume Party',
    tracks: 358,
    praiseCount: 1320,
    syndicatedPercent: 79,
    category: 'Halloween Blitz',
  },
  {
    theme: 'Early-Bird Christmas Duet',
    tracks: 294,
    praiseCount: 1150,
    syndicatedPercent: 76,
    category: 'Holiday Prep',
  },
  {
    theme: 'Saturday Roller Disco',
    tracks: 265,
    praiseCount: 980,
    syndicatedPercent: 71,
    category: 'Weekend Groove',
  },
  {
    theme: 'Cross-Country Roadtrip',
    tracks: 228,
    praiseCount: 860,
    syndicatedPercent: 68,
    category: 'Storytelling',
  },
  {
    theme: 'Local Coffee & Vinyl Ad',
    tracks: 184,
    praiseCount: 740,
    syndicatedPercent: 88,
    category: 'Craft Commercial',
  },
];

export const DAILY_COMMUNITY_ACTIVITY = [
  { day: 'Thu (Oct 7)', rockAndCountry: 94, popAndDisco: 72, holidaySpecials: 48 },
  { day: 'Fri (Oct 8)', rockAndCountry: 142, popAndDisco: 98, holidaySpecials: 64 },
  { day: 'Sat (Oct 9)', rockAndCountry: 156, popAndDisco: 134, holidaySpecials: 82 },
  { day: 'Sun (Oct 10)', rockAndCountry: 138, popAndDisco: 112, holidaySpecials: 91 },
  { day: 'Mon (Oct 11)', rockAndCountry: 108, popAndDisco: 86, holidaySpecials: 96 },
  { day: 'Tue (Oct 12)', rockAndCountry: 124, popAndDisco: 95, holidaySpecials: 118 },
  { day: 'Wed (Oct 13)', rockAndCountry: 149, popAndDisco: 118, holidaySpecials: 144 },
];

export const EXAMPLE_SONGS: ExampleSong[] = [];

export const Icons = {
  Play: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Pause: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  ),
  Info: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Sparkles: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
    </svg>
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronDown: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Loading: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  ),
  Download: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Video: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  RefreshCw: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Camera: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Mic: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  Radio: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  ),
  ThumbsUp: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  ShieldCheck: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  Share: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  X: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};