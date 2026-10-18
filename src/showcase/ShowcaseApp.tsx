import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  Mic,
  Music2,
  Pause,
  Play,
  Radio,
  Rss,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PublicCreation } from '../types/community';
import type { PraiseBadge, PublicPraise, PublicShow } from '../types/distribution';
import { PRAISE_BADGES } from '../types/distribution';
import { createUniqueSongArtworkSvg } from '../../constants';
import { ReportButton } from '../components/ReportButton';

export interface ShowcaseAppProps {
  apiBase?: string;
}

export function resolveApiBase(prop?: string): string {
  if (prop) return prop.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const custom = (window as unknown as { __TELL_THEM_API_BASE__?: string }).__TELL_THEM_API_BASE__;
    if (custom) return custom.replace(/\/$/, '');
    const query = new URLSearchParams(window.location.search).get('apiBase');
    if (query) return query.replace(/\/$/, '');
  }
  const envBase = (import.meta as unknown as { env?: { VITE_CATALOG_API_BASE?: string } }).env?.VITE_CATALOG_API_BASE;
  return envBase ? envBase.replace(/\/$/, '') : '';
}

export const ShowcaseApp: React.FC<ShowcaseAppProps> = ({ apiBase: propBase }) => {
  const apiBase = useMemo(() => resolveApiBase(propBase), [propBase]);
  const [creations, setCreations] = useState<PublicCreation[]>([]);
  const [shows, setShows] = useState<PublicShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'music' | 'podcasts' | 'shows'>('music');
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Player state
  const [activeItem, setActiveItem] = useState<PublicCreation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const creationsRes = await fetch(`${apiBase}/api/creations?limit=50`, {
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (!creationsRes.ok) {
          throw new Error(`Catalog service returned ${creationsRes.status}`);
        }
        const creationsData = (await creationsRes.json()) as { items: PublicCreation[] };
        if (!cancelled) setCreations(creationsData.items || []);

        // Best effort load shows
        try {
          const showsRes = await fetch(`${apiBase}/api/shows`, {
            credentials: 'omit',
            headers: { Accept: 'application/json' },
          });
          if (showsRes.ok && !cancelled) {
            const showsData = (await showsRes.json()) as { items?: PublicShow[]; show?: PublicShow };
            setShows(Array.isArray(showsData.items) ? showsData.items : []);
          }
        } catch {
          // Shows optional in isolated showcase
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load public catalog.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // Audio element management
  const playTrack = (item: PublicCreation) => {
    if (activeItem?.id === item.id) {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch(() => undefined);
          setIsPlaying(true);
        }
      }
      return;
    }
    setActiveItem(item);
    setCurrentTime(0);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.src = `${apiBase}/api/creations/${encodeURIComponent(item.id)}/audio`;
      audioRef.current.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (timeSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeSec;
      setCurrentTime(timeSec);
    }
  };

  const musicItems = useMemo(
    () => creations.filter((c) => c.kind === 'music' || !c.kind),
    [creations]
  );
  const podcastItems = useMemo(
    () => creations.filter((c) => c.kind === 'podcast'),
    [creations]
  );

  const genres = useMemo(() => {
    const set = new Set<string>();
    creations.forEach((c) => {
      if (c.genre) set.add(c.genre);
    });
    return ['All', ...Array.from(set).sort()];
  }, [creations]);

  const filteredItems = useMemo(() => {
    const list = tab === 'podcasts' ? podcastItems : musicItems;
    return list.filter((item) => {
      const matchGenre = selectedGenre === 'All' || item.genre.toLowerCase() === selectedGenre.toLowerCase();
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.creatorHandle.toLowerCase().includes(q) ||
        item.genre.toLowerCase().includes(q);
      return matchGenre && matchSearch;
    });
  }, [tab, podcastItems, musicItems, selectedGenre, search]);

  const formatSec = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="showcase-app"
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white pb-32"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Top Banner Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Tell Them Studio</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Showcase
                </span>
              </h1>
              <p className="text-xs text-slate-400">Streamed from CDN edge &amp; durable catalog</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              data-testid="back-to-studio"
              className="text-xs px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <span>Open Studio</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1 space-y-8">
        {/* Hero Section */}
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
            <Sparkles size={14} />
            <span>Public Listening Experience</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Community Audio &amp; Podcasts
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Listen to published community music creations and syndicated podcast episodes. Audio streams through high-speed
            CDN storage with audio range scrubbing, parent project remix attribution, and creator praise.
          </p>
        </section>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div role="tablist" aria-label="Showcase categories" className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              role="tab"
              aria-selected={tab === 'music'}
              onClick={() => setTab('music')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
                tab === 'music' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Music2 className="w-4 h-4" />
              <span>Music Tracks ({musicItems.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'podcasts'}
              onClick={() => setTab('podcasts')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
                tab === 'podcasts' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Podcasts ({podcastItems.length})</span>
            </button>
            {shows.length > 0 && (
              <button
                role="tab"
                aria-selected={tab === 'shows'}
                onClick={() => setTab('shows')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
                  tab === 'shows' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Rss className="w-4 h-4" />
                <span>RSS Feeds ({shows.length})</span>
              </button>
            )}
          </div>

          {/* Search & Genre Filter */}
          {tab !== 'shows' && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by title or @creator..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-56 sm:w-64"
                />
              </div>

              {genres.length > 1 && (
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {genres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        {loading && (
          <div data-testid="showcase-loading" className="py-16 text-center text-slate-400 space-y-3">
            <AudioLines className="w-8 h-8 animate-pulse mx-auto text-purple-400" />
            <p className="text-sm">Connecting to community catalog...</p>
          </div>
        )}

        {error && (
          <div
            data-testid="showcase-offline"
            className="p-6 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 space-y-2"
          >
            <h3 className="font-bold text-sm text-amber-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <span>Catalog Service Unavailable</span>
            </h3>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              The isolated showcase could not reach the backend catalog at{' '}
              <code className="bg-amber-950 px-1.5 py-0.5 rounded text-amber-200">{apiBase || 'current origin'}</code>.
              When running in standalone mode on a separate origin, ensure the backend is running and CORS allows this
              origin.
            </p>
          </div>
        )}

        {!loading && !error && tab === 'shows' && (
          <section className="space-y-4" data-testid="showcase-shows-list">
            <h3 className="text-lg font-bold text-white">Public Podcast RSS Feeds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shows.map((show) => (
                <div key={show.id} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-base text-white">{show.title}</h4>
                      <p className="text-xs text-purple-400 font-mono">{show.creatorHandle}</p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                      {show.publishedEpisodes} episode{show.publishedEpisodes === 1 ? '' : 's'}
                    </span>
                  </div>
                  {show.description && <p className="text-xs text-slate-400 line-clamp-2">{show.description}</p>}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-slate-400 truncate">{show.feedUrl}</span>
                    <a
                      href={show.feedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shrink-0 flex items-center gap-1"
                    >
                      <Rss className="w-3.5 h-3.5" />
                      <span>View Feed</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && !error && tab !== 'shows' && (
          <section className="space-y-4">
            {filteredItems.length === 0 ? (
              <div data-testid="showcase-empty" className="py-16 text-center text-slate-500 space-y-2">
                <Disc3 className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-sm font-medium">No published {tab === 'podcasts' ? 'podcasts' : 'music tracks'} found.</p>
                <p className="text-xs">Publish creations in Tell Them Studio to feature them in the public showcase.</p>
              </div>
            ) : (
              <div data-testid="showcase-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                  <ShowcaseCard
                    key={item.id}
                    item={item}
                    apiBase={apiBase}
                    isActive={activeItem?.id === item.id}
                    isPlaying={activeItem?.id === item.id && isPlaying}
                    onPlay={() => playTrack(item)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Floating Bottom Audio Player */}
      {activeItem && (
        <aside
          data-testid="showcase-player"
          className="fixed bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md p-4 z-40 shadow-2xl"
        >
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                data-testid="player-toggle"
                onClick={() => playTrack(activeItem)}
                className="w-12 h-12 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-purple-600/30 transition-transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div className="truncate">
                <p className="text-sm font-bold text-white truncate" data-testid="player-title">
                  {activeItem.title}
                </p>
                <p className="text-xs text-purple-400 font-mono truncate">{activeItem.creatorHandle}</p>
              </div>
            </div>

            {/* Scrub Slider */}
            <div className="flex items-center gap-3 w-full sm:max-w-md">
              <span className="text-xs font-mono text-slate-400 w-10 text-right">{formatSec(currentTime)}</span>
              <input
                type="range"
                data-testid="player-scrub"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="flex-1 accent-purple-500 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-400 w-10">{formatSec(duration)}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.muted = !muted;
                    setMuted(!muted);
                  }
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Card Component

interface ShowcaseCardProps {
  item: PublicCreation;
  apiBase: string;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}

const ShowcaseCard: React.FC<ShowcaseCardProps> = ({ item, apiBase, isActive, isPlaying, onPlay }) => {
  const [praiseList, setPraiseList] = useState<PublicPraise[]>([]);
  const [showPraiseForm, setShowPraiseForm] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<PraiseBadge>('Radio Ready');
  const [praiseMessage, setPraiseMessage] = useState('');
  const [handle, setHandle] = useState<string>(() => {
    try {
      return localStorage.getItem('tell-them-handle') || `@listener_${Math.random().toString(36).slice(2, 6)}`;
    } catch {
      return '@listener';
    }
  });
  const [sendingPraise, setSendingPraise] = useState(false);
  const [praiseStatus, setPraiseStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPraise() {
      try {
        const res = await fetch(`${apiBase}/api/creations/${encodeURIComponent(item.id)}/praise`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { items?: PublicPraise[] };
          setPraiseList(data.items || []);
        }
      } catch {
        // Praise optional
      }
    }
    void loadPraise();
    return () => {
      cancelled = true;
    };
  }, [item.id, apiBase]);

  const submitPraise = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingPraise(true);
    setPraiseStatus(null);
    try {
      // Ensure the listener has a creator session for native praise
      const cleanHandle = (handle.trim().startsWith('@') ? handle.trim() : `@${handle.trim()}`) || '@listener';
      await fetch(`${apiBase}/api/session`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: cleanHandle }),
      }).catch(() => undefined);

      const res = await fetch(`${apiBase}/api/creations/${encodeURIComponent(item.id)}/praise`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge: selectedBadge, message: praiseMessage.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { praise: PublicPraise };
        setPraiseList((prev) => [data.praise, ...prev]);
        setPraiseMessage('');
        setShowPraiseForm(false);
        setPraiseStatus('Praise sent! Thank you.');
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setPraiseStatus(err.error || 'Could not send praise.');
      }
    } catch {
      setPraiseStatus('Network error sending praise.');
    } finally {
      setSendingPraise(false);
    }
  };

  const coverSvg = useMemo(
    () =>
      createUniqueSongArtworkSvg({
        title: item.title,
        genre: item.genre,
        lyrics: item.lyrics,
        creatorHandle: item.creatorHandle,
        seed: item.id,
        motif: item.kind === 'podcast' ? 'podcast' : 'band',
      }),
    [item]
  );

  return (
    <article
      data-testid="showcase-card"
      aria-label={`Showcase track ${item.title}`}
      className={`rounded-3xl bg-slate-950 border transition-all overflow-hidden flex flex-col justify-between ${
        isActive ? 'border-purple-500 shadow-xl shadow-purple-500/10' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="p-5 space-y-4">
        {/* Cover & Play Action */}
        <div className="relative group rounded-2xl overflow-hidden aspect-video bg-slate-900 border border-slate-800">
          <img src={coverSvg} alt={`Cover for ${item.title}`} className="w-full h-full object-cover" />
          <button
            type="button"
            data-testid="card-play-button"
            onClick={onPlay}
            aria-label={isPlaying ? `Pause ${item.title}` : `Play ${item.title}`}
            className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-xl transform group-hover:scale-105 transition-transform">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </div>
          </button>
        </div>

        {/* Track Metadata */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-purple-400 font-semibold">{item.creatorHandle}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
              {item.genre}
            </span>
          </div>
          <h4 className="text-base font-bold text-white line-clamp-1">{item.title}</h4>

          {/* Remix Attribution */}
          {item.remixOf && (
            <p data-testid="remix-credit" className="text-[11px] font-semibold text-slate-400 pt-0.5">
              Remix of <span className="font-mono text-purple-300">{item.remixOf.creatorHandle}</span> —{' '}
              {item.remixOf.title}
            </p>
          )}

          {item.durationLabel && <p className="text-xs text-slate-500">{item.durationLabel}</p>}
        </div>

        {/* Lyrics or Description Snippet */}
        {item.lyrics && (
          <p className="text-xs text-slate-400 line-clamp-2 italic border-l-2 border-slate-800 pl-2">
            "{item.lyrics.slice(0, 140)}"
          </p>
        )}

        {/* Praise Badges Feed */}
        {praiseList.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Community Praise</span>
            <div className="flex flex-wrap gap-1.5" data-testid="praise-badges">
              {praiseList.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-purple-950/60 border border-purple-800/50 text-purple-300"
                >
                  <Heart className="w-2.5 h-2.5 fill-purple-400 text-purple-400" />
                  <span>{p.badge}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {praiseStatus && <p className="text-xs text-emerald-400 font-medium">{praiseStatus}</p>}

        {/* Inline Praise Form */}
        {showPraiseForm && (
          <form onSubmit={submitPraise} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-300">Choose badge</span>
              <select
                value={selectedBadge}
                onChange={(e) => setSelectedBadge(e.target.value as PraiseBadge)}
                className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 px-2 py-1.5"
              >
                {PRAISE_BADGES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-300">Encouragement (optional)</span>
              <input
                type="text"
                maxLength={200}
                value={praiseMessage}
                onChange={(e) => setPraiseMessage(e.target.value)}
                placeholder="What did you love about this track?"
                className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 px-2.5 py-1.5"
              />
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={sendingPraise}
                className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
              >
                {sendingPraise ? 'Sending...' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => setShowPraiseForm(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Card Footer Actions */}
      <div className="px-5 py-3 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => setShowPraiseForm(!showPraiseForm)}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-purple-300 font-semibold"
        >
          <Heart className="w-3.5 h-3.5" />
          <span>Praise</span>
        </button>

        <ReportButton creationId={item.id} title={item.title} />
      </div>
    </article>
  );
};
