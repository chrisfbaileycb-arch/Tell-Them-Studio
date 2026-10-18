import React, { useState } from 'react';
import {
  AudioLines,
  Clock,
  Disc3,
  Headphones,
  Mic,
  Music2,
  Pause,
  Play,
  Search,
  Sparkles,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CommunityFeedItem } from '../../types';
import {
  createStudioCoverSvg,
  createUniqueSongArtworkSvg,
  describeSongPictureTheme,
} from '../../constants';
import { cleanLyricsForDisplay } from '../utils/lyricsUtils';
import { ReportButton } from './ReportButton';

const RemixCredit: React.FC<{ item: CommunityFeedItem }> = ({ item }) =>
  item.remixOf ? (
    <p data-testid="remix-credit" className="text-[11px] font-semibold text-gray-600">
      Remix of <span className="font-mono text-blue-600">{item.remixOf.creatorHandle}</span> &mdash; {item.remixOf.title}
    </p>
  ) : null;

const MUSIC_GENRE_FILTERS = [
  'All',
  'Rock',
  'Hair Metal',
  'Pop',
  'Country',
  'Hip-Hop',
  'Disco',
  'Indie',
  'Electronic',
  'Jazz',
] as const;

const formatTime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const matchesGenreFilter = (trackGenre: string, filter: string): boolean => {
  if (filter === 'All') return true;
  const g = trackGenre.toLowerCase();
  const f = filter.toLowerCase();
  if (f === 'rock') {
    return g.includes('rock') && !g.includes('hair metal');
  }
  if (f === 'hair metal') {
    return g.includes('hair metal');
  }
  if (f === 'hip-hop') {
    return g.includes('hip-hop') || g.includes('rap');
  }
  return g.includes(f);
};

interface PublicCommunityShowcaseProps {
  feed: CommunityFeedItem[];
  activeTrack: CommunityFeedItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayTrack: (track: CommunityFeedItem) => void;
  onSeekTrack: (track: CommunityFeedItem, timeSec: number) => void;
  /** Where the feed came from; omitted for callers that do not care. */
  feedSource?: 'catalog' | 'cache' | 'demo';
}

export const PublicCommunityShowcase: React.FC<PublicCommunityShowcaseProps> = ({
  feed,
  activeTrack,
  isPlaying,
  currentTime,
  duration,
  onPlayTrack,
  onSeekTrack,
  feedSource,
}) => {
  const [showcaseMode, setShowcaseMode] = useState<'music' | 'podcast'>('music');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [handleQuery, setHandleQuery] = useState<string>('');
  const [expandedLyricsId, setExpandedLyricsId] = useState<string | null>(null);
  const [localScrubById, setLocalScrubById] = useState<Record<string, number>>({});

  // Strictly exclude any commercials; only music or podcast items
  const musicTracks = feed.filter((item) => item.type === 'music');
  const podcastEpisodes = feed.filter((item) => item.type === 'podcast');

  const filteredMusic = musicTracks.filter((item) => {
    const genreMatch = matchesGenreFilter(item.genre, selectedGenre);
    const normalizedQuery = handleQuery.trim().toLowerCase().replace(/^@/, '');
    const normalizedHandle = item.creatorHandle.toLowerCase().replace(/^@/, '');
    const handleMatch = !normalizedQuery || normalizedHandle.includes(normalizedQuery);
    return genreMatch && handleMatch;
  });

  const filteredPodcasts = podcastEpisodes.filter((item) => {
    const normalizedQuery = handleQuery.trim().toLowerCase().replace(/^@/, '');
    const normalizedHandle = item.creatorHandle.toLowerCase().replace(/^@/, '');
    return !normalizedQuery || normalizedHandle.includes(normalizedQuery);
  });

  const parseDurationEstimate = (label?: string): number => {
    if (!label) return 420;
    const parts = label.split(':').map(Number);
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return 420;
  };

  return (
    <section
      aria-label="Public Community Showcase"
      className="mb-10 rounded-[28px] border border-gray-200/80 bg-white p-6 sm:p-8 card-shadow space-y-6"
    >
      {/* Showcase Header & Top Toggle: Music vs. Podcasts */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/60 pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-blue-600">
            <Sparkles size={14} />
            <span>PUBLIC COMMUNITY SHOWCASE</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
            Community Music &amp; Podcast Feed
          </h2>
          <p className="text-sm text-gray-500">
            Listen to published community music tracks and multi-host podcast episodes right in the studio player. Commercials are excluded from this feed.
          </p>
          {feedSource && (
            <p data-testid="feed-source" data-feed-source={feedSource} className="text-xs text-gray-500">
              {feedSource === 'catalog'
                ? 'Showing the live community catalog.'
                : feedSource === 'cache'
                  ? 'Live catalog unreachable — showing the last catalog contents saved on this device.'
                  : 'Showing bundled demo tracks and what you published on this device.'}
            </p>
          )}
        </div>

        {/* Music vs. Podcasts Toggle */}
        <div
          role="group"
          aria-label="Showcase content type"
          className="inline-flex items-center gap-2 p-1.5 rounded-2xl bg-gray-100 border border-gray-200 self-start md:self-center shrink-0"
        >
          <button
            type="button"
            aria-pressed={showcaseMode === 'music'}
            onClick={() => setShowcaseMode('music')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              showcaseMode === 'music'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Music2 size={17} />
            <span>Music ({musicTracks.length})</span>
          </button>
          <button
            type="button"
            aria-pressed={showcaseMode === 'podcast'}
            onClick={() => setShowcaseMode('podcast')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              showcaseMode === 'podcast'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mic size={17} />
            <span>Podcasts ({podcastEpisodes.length})</span>
          </button>
        </div>
      </div>

      {/* Music Mode Controls: Genre Filter Bar + Creator Handle Search */}
      {showcaseMode === 'music' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Genre Filter Bar */}
            <div
              role="group"
              aria-label="Filter music by genre"
              className="flex flex-wrap items-center gap-2"
            >
              {MUSIC_GENRE_FILTERS.map((genreOption) => {
                const active = selectedGenre === genreOption;
                return (
                  <button
                    key={genreOption}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedGenre(genreOption)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? 'border-purple-500 bg-gray-900 text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {genreOption}
                  </button>
                );
              })}
            </div>

            {/* Creator Handle Search Input */}
            <div className="relative w-full lg:w-80 shrink-0">
              <Search
                size={16}
                className="
                  pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400
                "
              />
              <input
                type="search"
                aria-label="Search creator handles"
                value={handleQuery}
                onChange={(e) => setHandleQuery(e.target.value)}
                placeholder="Search creator handle (e.g. @glam_shred_88)…"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900"
              />
              {handleQuery && (
                <button
                  type="button"
                  aria-label="Clear handle search"
                  onClick={() => setHandleQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Music Cards Grid */}
          {filteredMusic.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                No published community music tracks match this filter.
              </p>
              <p className="text-xs text-gray-500">
                Try selecting &ldquo;All&rdquo; genres, clearing the creator handle search, or publishing a new song from the Create tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMusic.map((track) => {
                const isThisActive = activeTrack?.id === track.id;
                const isThisPlaying = isThisActive && isPlaying;
                const showLyrics = expandedLyricsId === track.id;
                const trackPictureUrl =
                  track.coverImageUrl ||
                  createUniqueSongArtworkSvg({
                    title: track.title,
                    genre: track.genre,
                    lyrics: track.lyrics,
                    creatorHandle: track.creatorHandle,
                    seed: track.id,
                    motif: 'band',
                  });
                const pictureTheme = describeSongPictureTheme({
                  title: track.title,
                  genre: track.genre,
                  lyrics: track.lyrics,
                  creatorHandle: track.creatorHandle,
                  seed: track.id,
                  motif: 'band',
                }).trim();

                return (
                  <article
                    key={track.id}
                    data-testid={`community-music-card-${track.id}`}
                    className={`rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                      isThisActive
                        ? 'border-purple-500 bg-gray-50/90 shadow-md'
                        : 'border-gray-200/80 bg-gray-50/50 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="relative h-48 w-full overflow-hidden border-b border-gray-200/70 bg-gray-900">
                        <img
                          data-testid="community-post-picture"
                          src={trackPictureUrl}
                          alt={`Song post picture coinciding with ${track.title}: ${pictureTheme}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-gray-950/75 backdrop-blur-sm text-[11px] text-white">
                          <span className="font-semibold text-amber-300 truncate">
                            Picture: {pictureTheme}
                          </span>
                          <span className="font-mono text-gray-300 shrink-0">
                            {track.durationLabel || '3:42'}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                            <span className="font-semibold text-blue-600 font-mono">
                              {track.creatorHandle}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-gray-800">{track.genre}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[11px] text-gray-500 font-mono tabular-nums">
                              {new Date(track.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-gray-900 leading-snug break-words">
                            {track.title}
                          </h3>
                          <RemixCredit item={track} />
                        </div>

                        {track.lyrics && (
                          <div className="text-xs text-gray-600">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLyricsId(showLyrics ? null : track.id)
                              }
                              className="text-blue-600 font-semibold hover:underline"
                            >
                              {showLyrics ? 'Hide lyrics' : 'View lyrics'}
                            </button>
                            {showLyrics && (
                              <pre className="mt-2 p-3 rounded-xl bg-white border border-gray-200 text-xs text-gray-700 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                                {cleanLyricsForDisplay(track.lyrics)}
                              </pre>
                            )}
                          </div>
                        )}
                        {track.fromCatalog && track.remoteId && (
                          <ReportButton creationId={track.remoteId} title={track.title} />
                        )}
                      </div>
                    </div>

                    <div className="px-5 pb-5 flex items-center justify-between gap-3 pt-3 border-t border-gray-200/60">
                      <span className="text-xs text-gray-500 truncate">
                        {track.vocalArrangement || 'Studio Vocal Arrangement'}
                      </span>
                      <button
                        type="button"
                        aria-label={isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                        onClick={() => onPlayTrack(track)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                          isThisPlaying
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-900 hover:bg-gray-800 text-white'
                        }`}
                      >
                        {isThisPlaying ? (
                          <>
                            <Pause size={14} fill="currentColor" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play size={14} fill="currentColor" />
                            <span>Play</span>
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Podcasts Mode: Episodic Cards with Narrator Info, Duration & Playback Scrubbers */}
      {showcaseMode === 'podcast' && (
        <div className="space-y-4">
          {filteredPodcasts.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                No published community podcast episodes yet.
              </p>
              <p className="text-xs text-gray-500">
                Produce a mini-podcast in the Podcasts tab and click &ldquo;Publish to Community&rdquo; to share it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredPodcasts.map((ep) => {
                const isThisActive = activeTrack?.id === ep.id;
                const isThisPlaying = isThisActive && isPlaying;
                const effectiveDuration =
                  isThisActive && duration > 0
                    ? duration
                    : parseDurationEstimate(ep.durationLabel);
                const effectivePosition = isThisActive
                  ? currentTime
                  : localScrubById[ep.id] || 0;
                const epPictureUrl =
                  ep.coverImageUrl ||
                  createUniqueSongArtworkSvg({
                    title: ep.title,
                    genre: 'Podcast',
                    lyrics: ep.lyrics,
                    creatorHandle: ep.creatorHandle,
                    seed: ep.id,
                    motif: 'podcast',
                  });

                return (
                  <article
                    key={ep.id}
                    data-testid={`community-podcast-card-${ep.id}`}
                    className={`rounded-2xl border p-6 flex flex-col justify-between gap-4 transition-all ${
                      isThisActive
                        ? 'border-purple-500 bg-gray-50/90 shadow-md'
                        : 'border-gray-200/80 bg-gray-50/50 hover:border-gray-300'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-4">
                        <img
                          data-testid="community-post-picture"
                          src={epPictureUrl}
                          alt={ep.title}
                          className="w-20 h-20 rounded-xl object-cover border border-gray-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="font-mono font-semibold text-blue-600">
                              {ep.creatorHandle}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-gray-800">
                              <Clock size={12} />
                              <span>Duration: {ep.durationLabel || formatTime(effectiveDuration)}</span>
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 leading-snug">
                            {ep.title}
                          </h3>
                          <RemixCredit item={ep} />
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                            <UserCheck size={14} className="text-blue-600 shrink-0" />
                            <span>{ep.narratorInfo || 'Narrators: Alex (Puck) & Sam (Kore)'}</span>
                          </div>
                        </div>
                      </div>

                      {ep.lyrics && (
                        <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed bg-white/80 p-3 rounded-xl border border-gray-200/60">
                          {cleanLyricsForDisplay(ep.lyrics)}
                        </p>
                      )}
                    </div>

                    {/* Episodic Playback Scrubber & Play Trigger */}
                    <div className="space-y-2.5 pt-3 border-t border-gray-200/60">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={isThisPlaying ? `Pause ${ep.title}` : `Play ${ep.title}`}
                          onClick={() => onPlayTrack(ep)}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                            isThisPlaying
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-900 hover:bg-gray-800 text-white'
                          }`}
                        >
                          {isThisPlaying ? (
                            <>
                              <Pause size={14} fill="currentColor" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play size={14} fill="currentColor" />
                              <span>Play</span>
                            </>
                          )}
                        </button>

                        <div className="flex-1 flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono tabular-nums text-gray-500 shrink-0">
                            {formatTime(effectivePosition)}
                          </span>
                          <input
                            type="range"
                            aria-label={`Playback scrubber for ${ep.title}`}
                            min={0}
                            max={Math.max(1, effectiveDuration)}
                            step={0.5}
                            value={Math.min(effectivePosition, Math.max(1, effectiveDuration))}
                            onChange={(e) => {
                              const nextTime = Number(e.target.value);
                              setLocalScrubById((prev) => ({ ...prev, [ep.id]: nextTime }));
                              onSeekTrack(ep, nextTime);
                            }}
                            className="w-full accent-purple-500 cursor-pointer"
                          />
                          <span className="text-[11px] font-mono tabular-nums text-gray-500 shrink-0">
                            {isThisActive && duration > 0
                              ? formatTime(duration)
                              : ep.durationLabel || formatTime(effectiveDuration)}
                          </span>
                        </div>
                      </div>
                      {ep.fromCatalog && ep.remoteId && <ReportButton creationId={ep.remoteId} title={ep.title} />}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

interface PersistentCommunityPlayerProps {
  track: CommunityFeedItem | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onClose: () => void;
  onTimeUpdate: (timeSec: number) => void;
  onDurationChange: (durSec: number) => void;
  onPlayStateChange: (playing: boolean) => void;
}

const VISUALIZER_BAR_COUNT = 28;
const PLAYBACK_SPEEDS = [
  { value: 0.5, label: '0.5x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2.0x' },
] as const;

export const PersistentCommunityPlayer: React.FC<PersistentCommunityPlayerProps> = ({
  track,
  audioRef,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  onClose,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
}) => {
  const [muted, setMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const envelopeRef = React.useRef<number[]>([]);
  const phaseRef = React.useRef<number>(0);
  const currentLevelsRef = React.useRef<number[]>(
    Array.from({ length: VISUALIZER_BAR_COUNT }, () => 0.16)
  );

  // Sync playbackRate with the underlying <audio> element whenever speed or track changes
  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, track?.audioUrl, audioRef]);

  const handleSelectSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Decode real audio amplitude envelope from track.audioUrl without hijacking the <audio> element
  React.useEffect(() => {
    if (!track?.audioUrl) {
      envelopeRef.current = [];
      return;
    }
    let cancelled = false;
    let ctx: AudioContext | null = null;

    (async () => {
      try {
        const res = await fetch(track.audioUrl);
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        const channel = decoded.getChannelData(0);
        const segments = 120;
        const blockSize = Math.max(1, Math.floor(channel.length / segments));
        const peaks: number[] = [];
        for (let i = 0; i < segments; i++) {
          const start = i * blockSize;
          const end = Math.min(channel.length, start + blockSize);
          const stride = Math.max(1, Math.floor((end - start) / 64));
          let sum = 0;
          let count = 0;
          for (let j = start; j < end; j += stride) {
            sum += Math.abs(channel[j]);
            count++;
          }
          peaks.push(count > 0 ? sum / count : 0.25);
        }
        const maxPeak = Math.max(...peaks, 0.01);
        if (!cancelled) {
          envelopeRef.current = peaks.map((p) => Math.max(0.18, Math.min(1, p / maxPeak)));
        }
      } catch {
        // Fallback envelope if audio decoding is unavailable
        if (!cancelled) {
          envelopeRef.current = [];
        }
      } finally {
        if (ctx && ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track?.audioUrl]);

  // Animate canvas spectrum visualizer when playing; settle smoothly when paused
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;

    let rafId = 0;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderFrame = () => {
      const width = canvas.clientWidth || 160;
      const height = canvas.clientHeight || 36;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const bars = VISUALIZER_BAR_COUNT;
        const gap = 2.5;
        const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
        const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

        const env = envelopeRef.current;
        const envIndex =
          env.length > 0
            ? Math.min(env.length - 1, Math.floor(progressRatio * env.length))
            : -1;
        const baseEnergy = envIndex >= 0 ? env[envIndex] : 0.65;

        if (isPlaying && !muted && !reducedMotion) {
          phaseRef.current += 0.16 * playbackSpeed;
        }

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        if (track.type === 'podcast') {
          gradient.addColorStop(0, '#38bdf8');
          gradient.addColorStop(0.6, '#818cf8');
          gradient.addColorStop(1, '#c084fc');
        } else {
          gradient.addColorStop(0, '#7c3aed');
          gradient.addColorStop(0.55, '#ba7aff');
          gradient.addColorStop(1, '#f59e0b');
        }

        for (let i = 0; i < bars; i++) {
          const centerWeight = 1 - Math.abs((i - (bars - 1) / 2) / ((bars - 1) / 2)) * 0.45;
          let targetLevel = 0.16;

          if (isPlaying && !muted) {
            const waveA = Math.sin(phaseRef.current + i * 0.55) * 0.28;
            const waveB = Math.cos(phaseRef.current * 1.45 - i * 0.35) * 0.22;
            const harmonic = Math.sin(phaseRef.current * 0.7 + i * 1.1) * 0.14;
            targetLevel = Math.max(
              0.18,
              Math.min(0.98, (baseEnergy * 0.62 + 0.35 + waveA + waveB + harmonic) * centerWeight)
            );
          } else {
            // Quiet resting waveform profile when paused or muted
            const idleProfile = 0.15 + Math.sin(i * 0.5) * 0.05;
            targetLevel = Math.max(0.12, idleProfile * centerWeight);
          }

          const prev = currentLevelsRef.current[i] ?? 0.16;
          const next = prev + (targetLevel - prev) * (isPlaying ? 0.32 : 0.18);
          currentLevelsRef.current[i] = next;

          const barHeight = Math.max(4, next * (height - 4));
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          const isPlayedPortion = i / bars <= progressRatio;
          ctx.fillStyle = isPlaying
            ? gradient
            : isPlayedPortion
            ? '#9333ea'
            : 'rgba(100, 116, 139, 0.45)';

          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, barWidth, barHeight, 2);
          } else {
            ctx.rect(x, y, barWidth, barHeight);
          }
          ctx.fill();
        }

        ctx.restore();
      }

      if (isPlaying && !reducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();
    if (isPlaying && !reducedMotion) {
      rafId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, muted, currentTime, duration, track, playbackSpeed]);

  if (!track) return null;

  return (
    <aside
      aria-label="Persistent Community Player"
      data-testid="persistent-community-player"
      className="fixed bottom-0 inset-x-0 z-50 glass border-t border-gray-200/80 px-4 sm:px-6 py-3 shadow-2xl"
    >
      <audio
        ref={audioRef}
        src={track.audioUrl}
        muted={muted}
        preload="metadata"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = playbackSpeed;
          onDurationChange(e.currentTarget.duration);
        }}
        onDurationChange={(e) => onDurationChange(e.currentTarget.duration)}
        onPlay={(e) => {
          e.currentTarget.playbackRate = playbackSpeed;
          onPlayStateChange(true);
          document.querySelectorAll('audio').forEach((a) => {
            if (a !== e.currentTarget) a.pause();
          });
        }}
        onPause={() => onPlayStateChange(false)}
        onEnded={() => onPlayStateChange(false)}
      />

      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Track Identity */}
        <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial sm:w-64">
          <div className="relative shrink-0">
            <img
              src={
                track.coverImageUrl ||
                createStudioCoverSvg(
                  track.type === 'podcast' ? '#0f172a' : '#1e1b4b',
                  track.type === 'podcast' ? '#1e3a8a' : '#7f1d1d',
                  track.type === 'podcast' ? '#38bdf8' : '#f59e0b',
                  track.type === 'podcast' ? 'podcast' : 'band'
                )
              }
              alt={track.title}
              className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="font-mono font-semibold text-blue-600 truncate">
                {track.creatorHandle}
              </span>
              <span aria-hidden="true">·</span>
              <span className="uppercase font-semibold">{track.genre}</span>
            </div>
            <div className="text-sm font-bold text-gray-900 truncate" title={track.title}>
              {track.title}
            </div>
          </div>
        </div>

        {/* Transport, Live Audio Visualizer & Scrubber */}
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-2xl">
          <button
            type="button"
            aria-label={isPlaying ? `Pause ${track.title} in player` : `Play ${track.title} in player`}
            onClick={onTogglePlay}
            className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0 hover:bg-gray-800"
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>

          {/* Animated Audio Visualizer */}
          <div
            role="img"
            aria-label={isPlaying ? `Audio visualizer animating for ${track.title}` : `Audio visualizer paused for ${track.title}`}
            data-testid="community-audio-visualizer"
            data-playing={isPlaying && !muted ? 'true' : 'false'}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-900/90 border border-gray-800 shrink-0"
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="w-28 sm:w-36 h-7 block"
            />
          </div>

          <span className="text-xs font-mono tabular-nums text-gray-600 shrink-0">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            aria-label="Persistent player scrubber"
            min={0}
            max={Math.max(1, duration || 8)}
            step={0.1}
            value={Math.min(currentTime, Math.max(1, duration || 8))}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full accent-purple-500 cursor-pointer"
          />
          <span className="text-xs font-mono tabular-nums text-gray-600 shrink-0">
            {duration > 0 ? formatTime(duration) : track.durationLabel || '0:08'}
          </span>
        </div>

        {/* Playback Speed Controls, Volume & Dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Playback speed"
            data-testid="playback-speed-controls"
            className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-gray-100 border border-gray-200/80"
          >
            {PLAYBACK_SPEEDS.map((s) => {
              const active = playbackSpeed === s.value;
              return (
                <button
                  key={s.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectSpeed(s.value)}
                  className={`px-2 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors ${
                    active
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label={muted ? 'Unmute player' : 'Mute player'}
            onClick={() => setMuted(!muted)}
            className="p-2 rounded-xl bg-gray-100 text-gray-700 hover:text-gray-900"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            type="button"
            aria-label="Close persistent player"
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 text-gray-700 hover:text-gray-900"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
