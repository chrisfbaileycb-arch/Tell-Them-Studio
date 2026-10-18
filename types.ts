export type Duration =
  | '3:50 Radio Master (Max)'
  | '2:48 Radio Single'
  | '2:15 Tight Single'
  | '0:30 Hook / Jingle'
  | '2:48 Radio Master (Max)'
  | '0:30 Hook Preview'
  | 'Lyria 3.5'
  | 'Lyria 3 Pro'
  | 'Lyria 3 Clip (30s)'
  | 'Clip (30s)'
  | 'Pro';

export type LyricsOption = 'Auto' | 'Custom' | 'Instrumental';

export type StudioTab =
  | 'bands'
  | 'singers'
  | 'acoustic'
  | 'stations'
  | 'podcasts'
  | 'commercials'
  | 'holidays'
  | 'trending'
  | 'listen'
  | 'library'
  | 'creative';

export type BandArchetype =
  | 'Rock Band'
  | 'Hair Metal Band'
  | 'Country Band'
  | 'Pop Band'
  | 'Disco Band'
  | 'Rap'
  | 'Hip-Hop'
  | 'Indie'
  | 'Old-School'
  | 'Jazz'
  | 'Electronic'
  | 'Anime-Inspired'
  | 'Serenity'
  | 'Custom Genre'
  | 'Singer-Free Instrumental';

export type VocalArrangement =
  | 'Multi-Singer Trade-Off (Male & Female)'
  | '3-Part Band Harmonies'
  | 'Dual Female Lead & Harmony'
  | 'Dual Male Lead & Harmony'
  | 'Lead Female + Band Backing'
  | 'Lead Male + Band Backing'
  | 'Singer-Free (Record Your Own Voice)';

export type ContentOriginType =
  | 'AI-Generated Material'
  | 'Human Voice + AI Backing Band'
  | 'AI Multi-Host Podcast'
  | 'Craft Commercial Spot';

export interface PraiseComment {
  id: string;
  handle: string;
  badge: 'Great Harmony' | 'Radio Ready' | 'Catchy Hook' | 'Clever Ad Craft' | 'Love Your Voice' | 'Question for Creator';
  message: string;
  timestamp: string;
}

export interface ExampleSong {
  id: string;
  title: string;
  artist: string;
  handle: string;
  coverUrl: string;
  prompt: string;
  duration: string;
  tags: string[];
  bandType?: BandArchetype;
  vocalStyle?: VocalArrangement;
  originType?: ContentOriginType;
}

export type GenerationStatus = 'idle' | 'generating' | 'completed' | 'error';

export interface PodcastChapter {
  timestamp: string;
  title: string;
  summary: string;
}

export interface CommercialFrame {
  timeRange: string;
  visual: string;
  audioCue: string;
}

export type DistributionPlatformName =
  | 'Spotify'
  | 'YouTube Music'
  | 'YouTube'
  | 'Amazon Music'
  | 'Apple Music & Podcasts'
  | 'SoundCloud'
  | 'Bandcamp'
  | 'TIDAL'
  | 'iHeartRadio'
  | 'Audiomack'
  | 'Apple Podcasts';

export interface HandoffPlatformInfo {
  id: string;
  name: DistributionPlatformName;
  category: string;
  handoffUrl: string;
  loginNote: string;
  acceptedFormats: string;
}

export interface SongResult {
  id: string;
  itemType?: 'song' | 'podcast' | 'commercial';
  status: GenerationStatus;
  logs: string[];
  audioUrl: string | null;
  humanVocalUrl?: string | null;
  coverImageUrl: string | null;
  title: string | null;
  creatorHandle: string;
  bandType: BandArchetype;
  customGenreName?: string;
  vocalArrangement: VocalArrangement;
  originType: ContentOriginType;
  lyrics: string;
  metadata: string;
  fullPrompt: string | null;
  error: string | null;
  duration: Duration;
  maxCapLabel: string;
  timestamp: Date;
  isExpanded: boolean;
  thumbsUp: number;
  praiseList: PraiseComment[];
  publishedPlatforms: DistributionPlatformName[];
  // Podcast specific fields
  podcastSchedule?: {
    dayOfWeek: string;
    timeOfDay: string;
    targetMinutes: number;
    committedWeekly: boolean;
  };
  podcastChapters?: PodcastChapter[];
  // Commercial specific fields
  commercialMeta?: {
    brandName: string;
    tagline: string;
    callToAction: string;
    spotLength: '30s' | '60s';
    pgVerified: boolean;
    storyboard: CommercialFrame[];
  };
  // Storage for retries
  originalPrompt: string;
  originalDuration: Duration;
  originalLyricsOption: LyricsOption;
}

export interface RadioStation {
  id: string;
  name: string;
  callSign: string;
  creatorHandle: string;
  tagline: string;
  genreFocus: string;
  coverSvgUrl: string;
  listenersCount: number;
  thumbsUp: number;
  syndicatedTo: DistributionPlatformName[];
  trackIds: string[];
  praiseComments: PraiseComment[];
}

export interface HolidayTemplate {
  id: string;
  holiday: 'Halloween (Last-Minute Blitz)' | 'Christmas (Early-Bird Prep)' | 'Thanksgiving & Autumn' | 'New Year Countdown';
  title: string;
  bandType: BandArchetype;
  vocalArrangement: VocalArrangement;
  duration: string;
  prompt: string;
  suggestedLyrics: string;
  coverSvgUrl: string;
  countdownNote: string;
}

export interface GenerationState {
  results: SongResult[];
}

export interface CommunityFeedItem {
  id: string;
  title: string;
  creatorHandle: string;
  genre: string;
  audioUrl: string;
  lyrics: string;
  type: 'music' | 'podcast';
  createdAt: string;
  narratorInfo?: string;
  durationLabel?: string;
  coverImageUrl?: string;
  vocalArrangement?: string;
  /** Server-side creation id when this item is backed by the live catalog. */
  remoteId?: string;
  /** True when the item came from the live catalog (vs. bundled demo / local-only publish). */
  fromCatalog?: boolean;
  /** Mandatory attribution when this item is a remix of another creator's project. */
  remixOf?: { id: string; title: string; creatorHandle: string };
}

