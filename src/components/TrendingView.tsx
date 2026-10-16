import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  WEEKLY_TRENDING_GENRES,
  WEEKLY_TRENDING_THEMES,
  DAILY_COMMUNITY_ACTIVITY,
  HOLIDAY_TEMPLATES,
  Icons,
} from '../../constants';
import { BandArchetype, HolidayTemplate, SongResult, StudioTab } from '../../types';

interface TrendingViewProps {
  results: SongResult[];
  onSelectTrend: (params: { bandType: BandArchetype; prompt: string }) => void;
  onLoadHolidayTemplate: (tpl: HolidayTemplate) => void;
  onNavigateTab: (tab: StudioTab) => void;
}

interface SpecialtyHubItem {
  id: string;
  title: string;
  category: string;
  description: string;
  actionLabel: string;
  targetTab: StudioTab;
  presetBand?: BandArchetype;
  presetPrompt?: string;
}

const INITIAL_OTHER_HUBS: SpecialtyHubItem[] = [
  {
    id: 'hub-singer',
    title: 'Singer & Duet Spotlight Hub',
    category: 'Vocal Craft · Max 3:50',
    description:
      'Dedicated to lead vocalists, male & female duets, 3-part harmonies, and creators recording their own live voice over backing tracks.',
    actionLabel: 'Open Singer Studio',
    targetTab: 'singers',
    presetBand: 'Pop Band',
    presetPrompt:
      'Create a vocal-forward Pop & Soul duet where male and female lead singers trade emotional verses and soar together in a 3-part harmony chorus. Capped at 3:50.',
  },
  {
    id: 'hub-acoustic',
    title: 'Unplugged Acoustic & Coffeehouse Hub',
    category: 'Stripped-Back · Max 3:50',
    description:
      'Warm fingerstyle flattop guitar, intimate upright piano, cello, and honest singer-songwriter storytelling.',
    actionLabel: 'Open Acoustic Studio',
    targetTab: 'acoustic',
    presetBand: 'Indie',
    presetPrompt:
      'Create an intimate unplugged acoustic studio session featuring warm fingerstyle acoustic guitar, upright bass, brushed percussion, and close-mic vocal harmonies. Capped at 3:50.',
  },
  {
    id: 'hub-hometown',
    title: 'Hometown & Friday Night Game-Day Hub',
    category: 'City Pride · 100% Royalty-Safe',
    description:
      'Original black-and-gold riverfront anthems, stadium rock choruses, and hometown pride songs with zero trademark infringement.',
    actionLabel: 'Launch Hometown Anthem',
    targetTab: 'bands',
    presetBand: 'Rock Band',
    presetPrompt:
      'Create an upbeat Rock Band hometown football pride anthem in black and gold with male and female singers trading verses and an electric stadium chorus using 100% original lyrics.',
  },
  {
    id: 'hub-disco',
    title: 'Mirrorball Disco & Funk Ensemble Hub',
    category: 'Weekend Groove · Horn Section',
    description:
      'Four-on-the-floor disco strings, live brass stabs, slap bass, and joyful group call-and-response vocals.',
    actionLabel: 'Launch Disco Ensemble',
    targetTab: 'bands',
    presetBand: 'Disco Band',
    presetPrompt:
      'Create a groovy 120 BPM Disco Band song with 3-part vocal harmonies, brass horn section, rhythm guitar, and Saturday night roller rink energy.',
  },
  {
    id: 'hub-commercial',
    title: 'True Craft Broadcast Commercial Hub',
    category: 'Ad Craft · :30 & :60 PG Spots',
    description:
      'Authentic radio and video advertising storytelling for local shops, shows, and brands—zero fake celebrity avatars.',
    actionLabel: 'Open Commercial Studio',
    targetTab: 'commercials',
  },
  {
    id: 'hub-podcast',
    title: 'Weekly 5–10m Mini-Podcast Hub',
    category: 'Scheduled Talk · Anti-Spam',
    description:
      'Consistent weekly dual-host episodes between 5 and 10 minutes with 1080p video export for Spotify and YouTube.',
    actionLabel: 'Open Mini-Podcasts',
    targetTab: 'podcasts',
  },
  {
    id: 'hub-serenity',
    title: 'Serenity, Gratitude & Encouragement Hub',
    category: 'Reflective · All Traditions Welcome',
    description:
      'Gentle acoustic arrangements, peaceful harmonies, and uplifting reflections for quiet mornings and evening rest.',
    actionLabel: 'Create Serenity Track',
    targetTab: 'bands',
    presetBand: 'Serenity',
    presetPrompt:
      'Create a gentle, uplifting Serenity song with warm acoustic guitar, soft piano, and peaceful vocal harmonies centered on gratitude and hope.',
  },
  {
    id: 'hub-anime',
    title: 'Anime & Original Soundtrack Worlds Hub',
    category: 'Cinematic · High-Energy Openings',
    description:
      'Original 3:50 opening themes, orchestral rock bands, and vivid storyboard concepts for original animated worlds.',
    actionLabel: 'Create Anime Theme',
    targetTab: 'bands',
    presetBand: 'Anime-Inspired',
    presetPrompt:
      'Create an energetic, uplifting Anime-Inspired rock and synth band opening theme with soaring lead vocals and dramatic chorus lift. Capped at 3:50.',
  },
];

const GENRE_BAR_COLORS = [
  '#0f172a',
  '#2563eb',
  '#9333ea',
  '#db2777',
  '#059669',
  '#d97706',
];

const THEME_BAR_COLORS = [
  '#2563eb',
  '#ea580c',
  '#059669',
  '#9333ea',
  '#0284c7',
  '#4f46e5',
];

export const TrendingView: React.FC<TrendingViewProps> = ({
  results,
  onSelectTrend,
  onLoadHolidayTemplate,
  onNavigateTab,
}) => {
  const [genreMetric, setGenreMetric] = useState<
    'tracksCreated' | 'thumbsUp' | 'stationSpins'
  >('tracksCreated');
  const [themeMetric, setThemeMetric] = useState<'tracks' | 'praiseCount'>(
    'tracks'
  );
  const [holidayFilter, setHolidayFilter] = useState<
    'All' | 'Halloween (Last-Minute Blitz)' | 'Christmas (Early-Bird Prep)'
  >('All');

  // Randomize the rest of the hubs underneath Trending on mount, with a button to reshuffle anytime
  const [randomizedHubs, setRandomizedHubs] = useState<SpecialtyHubItem[]>(() => {
    const copy = [...INITIAL_OTHER_HUBS];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  });

  const handleReshuffleHubs = () => {
    setRandomizedHubs((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
  };

  // Merge live session creations into the 7-day community genre totals
  const liveGenresData = useMemo(() => {
    return WEEKLY_TRENDING_GENRES.map((item) => {
      const matchingSessionCount = results.filter((r) =>
        item.genre.toLowerCase().includes(r.bandType.split(' ')[0].toLowerCase())
      ).length;
      const matchingThumbs = results
        .filter((r) =>
          item.genre.toLowerCase().includes(r.bandType.split(' ')[0].toLowerCase())
        )
        .reduce((acc, r) => acc + r.thumbsUp, 0);

      return {
        ...item,
        tracksCreated: item.tracksCreated + matchingSessionCount,
        thumbsUp: item.thumbsUp + matchingThumbs,
      };
    });
  }, [results]);

  const totalWeeklyTracks = useMemo(
    () => liveGenresData.reduce((sum, g) => sum + g.tracksCreated, 0),
    [liveGenresData]
  );

  const totalWeeklyPraise = useMemo(
    () => liveGenresData.reduce((sum, g) => sum + g.thumbsUp, 0),
    [liveGenresData]
  );

  const totalStationSpins = useMemo(
    () => liveGenresData.reduce((sum, g) => sum + g.stationSpins, 0),
    [liveGenresData]
  );

  return (
    <section className="space-y-12 mb-14">
      {/* Header & Summary KPI Strip */}
      <div className="hero-surface-card rounded-3xl p-8 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="relative z-10 space-y-3">
          <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
            7-Day Community Pulse · Analytics & Specialty Hubs
          </span>
          <h1
            className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter text-transparent leading-none py-1"
            style={{ textWrap: 'balance' }}
          >
            Weekly Community Trends & Specialty Hubs
          </h1>
          <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed tracking-tight">
            Real-time 7-day pulse of the most popular band genres, singer arrangements, and acoustic sessions—followed below by the Seasonal Holiday Hub and our rotating community creation hubs.
          </p>
        </div>

        <div className="relative z-10 text-xs text-gray-500 font-mono tabular-nums shrink-0">
          Window: Last 7 Days · All Songs ≤ 3:50 (Jingles Separate)
        </div>
      </div>

      {/* 4-Column Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 card-shadow space-y-1">
          <div className="text-xs text-gray-500">7-Day Studio Tracks Created</div>
          <div className="text-3xl font-extrabold text-gray-900 font-mono tabular-nums">
            {totalWeeklyTracks.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            Band, Singer & Acoustic Studios
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 card-shadow space-y-1">
          <div className="text-xs text-gray-500">Kindness Thumbs-Up & Praise</div>
          <div className="text-3xl font-extrabold text-blue-600 font-mono tabular-nums">
            {totalWeeklyPraise.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            100% Handle-Verified Positive Input
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 card-shadow space-y-1">
          <div className="text-xs text-gray-500">Creator Radio Station Spins</div>
          <div className="text-3xl font-extrabold text-gray-900 font-mono tabular-nums">
            {totalStationSpins.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            Syndicated to Spotify, YouTube & Amazon
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 card-shadow space-y-1">
          <div className="text-xs text-gray-500">Human Voice + Backing Share</div>
          <div className="text-3xl font-extrabold text-emerald-700 font-mono tabular-nums">
            39.4%
          </div>
          <div className="text-xs text-gray-500">
            Creators singing over instrumentals
          </div>
        </div>
      </div>

      {/* Primary Charts Grid: Most Popular Genres & Most Popular Song Themes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Most Popular Band Genres */}
        <div className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Most Popular Genres (Last 7 Days)
              </h2>
              <p className="text-xs text-gray-500">
                Multi-singer rock, country, disco & pop bands vs. singer-free backing
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
              {(
                [
                  { key: 'tracksCreated', label: 'Tracks' },
                  { key: 'thumbsUp', label: 'Thumbs-Up' },
                  { key: 'stationSpins', label: 'Station Spins' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setGenreMetric(m.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    genreMetric === m.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={liveGenresData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 16, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  type="category"
                  dataKey="genre"
                  width={150}
                  tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey={genreMetric} radius={[0, 8, 8, 0]} barSize={24}>
                  {liveGenresData.map((entry, idx) => (
                    <Cell
                      key={entry.genre}
                      fill={GENRE_BAR_COLORS[idx % GENRE_BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>Lead Vocal Format: Male & Female Trade-Offs (62% of band tracks)</span>
            <span className="font-mono tabular-nums">Hard Song Cutoff: 3:50</span>
          </div>
        </div>

        {/* Chart 2: Most Popular Song Themes */}
        <div className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Trending Song Themes & Topics
              </h2>
              <p className="text-xs text-gray-500">
                Year-round hometown anthems, roadtrips, coffeehouse themes & seasonal specials
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
              {(
                [
                  { key: 'tracks', label: 'Songs Created' },
                  { key: 'praiseCount', label: 'Community Praise' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setThemeMetric(m.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    themeMetric === m.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={WEEKLY_TRENDING_THEMES}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 16, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  type="category"
                  dataKey="theme"
                  width={155}
                  tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey={themeMetric} radius={[0, 8, 8, 0]} barSize={24}>
                  {WEEKLY_TRENDING_THEMES.map((entry, idx) => (
                    <Cell
                      key={entry.theme}
                      fill={THEME_BAR_COLORS[idx % THEME_BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>Top Year-Round Theme: Hometown Pride & Roadtrip Anthems</span>
            <span className="font-mono tabular-nums">100% Royalty-Safe Original</span>
          </div>
        </div>
      </div>

      {/* Chart 3: 7-Day Daily Momentum Area Chart + Quick-Launch Trend Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              7-Day Daily Creation Momentum
            </h2>
            <p className="text-xs text-gray-500">
              Daily community output across Band Studio, Singer Studio & Acoustic sessions
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={DAILY_COMMUNITY_ACTIVITY}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="rockAndCountry"
                  name="Rock & Country Bands"
                  stroke="#2563eb"
                  fill="#dbeafe"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="popAndDisco"
                  name="Singers, Pop & Disco"
                  stroke="#9333ea"
                  fill="#f3e8ff"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="holidaySpecials"
                  name="Acoustic & Seasonal"
                  stroke="#ea580c"
                  fill="#ffedd5"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Actionable Trending Breakdown Table */}
        <div className="lg:col-span-7 bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Create from This Week’s Top Community Trends
              </h2>
              <p className="text-xs text-gray-500">
                Click any trending theme below to pre-configure the studio with that lineup
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-bold text-gray-500">
                  <th className="py-2.5 pr-4">Trending Theme</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">7d Tracks</th>
                  <th className="py-2.5 px-3 text-right">Praise</th>
                  <th className="py-2.5 pl-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {WEEKLY_TRENDING_THEMES.map((row) => {
                  const mappedBand: BandArchetype =
                    row.theme.includes('Christmas')
                      ? 'Country Band'
                      : row.theme.includes('Disco')
                      ? 'Disco Band'
                      : row.theme.includes('Coffee')
                      ? 'Pop Band'
                      : 'Rock Band';

                  return (
                    <tr key={row.theme} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 pr-4 font-bold text-gray-900">{row.theme}</td>
                      <td className="py-3 px-3 text-gray-600">{row.category}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-gray-800">
                        {row.tracks}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-blue-600 font-semibold">
                        {row.praiseCount.toLocaleString()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <button
                          onClick={() =>
                            onSelectTrend({
                              bandType: mappedBand,
                              prompt: `Create an upbeat, radio-ready ${mappedBand} song inspired by the trending community theme "${row.theme}" with male and female multi-singer vocals trading verses and a memorable chorus. Capped at 3:50.`,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                        >
                          <Icons.Sparkles className="w-3 h-3" />
                          <span>Use Trend</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* HOLIDAY HUB (PLACED UNDER TRENDING AS A SEASONAL SPECIALTY HUB)       */}
      {/* ===================================================================== */}
      <div className="pt-6 border-t border-gray-200/80 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
              Seasonal Hub Under Trending
            </span>
            <h2 className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-2xl md:text-3xl font-semibold tracking-tighter text-transparent">
              Holiday Hub: Seasonal Music & Radio Workshop
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl tracking-tight">
              Tucked underneath Trending for when holidays roll around—grab last-minute Halloween party band templates or prep early-bird Christmas & winter radio singles.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {(
              [
                'All',
                'Halloween (Last-Minute Blitz)',
                'Christmas (Early-Bird Prep)',
              ] as const
            ).map((filt) => (
              <button
                key={filt}
                onClick={() => setHolidayFilter(filt)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  holidayFilter === filt
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {filt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {HOLIDAY_TEMPLATES.filter(
            (t) => holidayFilter === 'All' || t.holiday === holidayFilter
          ).map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-[32px] p-7 card-shadow border border-gray-200/80 flex flex-col justify-between gap-5"
            >
              <div className="flex items-start gap-5">
                <img
                  src={tpl.coverSvgUrl}
                  alt={tpl.title}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-200"
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-orange-600">{tpl.holiday}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{tpl.duration}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{tpl.title}</h3>
                  <p className="text-xs text-gray-500">
                    {tpl.bandType} · {tpl.vocalArrangement}
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed pt-1">
                    {tpl.prompt}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500">{tpl.countdownNote}</span>
                <button
                  onClick={() => onLoadHolidayTemplate(tpl)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white music-gradient whitespace-nowrap shrink-0"
                >
                  Load Holiday Template
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* REST OF THE HUBS RANDOMIZED UNDERNEATH TRENDING                       */}
      {/* ===================================================================== */}
      <div className="pt-6 border-t border-gray-200/80 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-2xl font-semibold tracking-tighter text-transparent">
              More Community & Creation Hubs
            </h2>
            <p className="text-xs text-gray-600 tracking-tight">
              Rotated underneath Trending so year-round band, singer, and acoustic creation stays front and center at the top.
            </p>
          </div>
          <button
            onClick={handleReshuffleHubs}
            className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-800 flex items-center gap-2 w-fit shrink-0"
          >
            <Icons.RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Shuffle Hubs Order</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {randomizedHubs.map((hub) => (
            <div
              key={hub.id}
              className="bg-white rounded-3xl p-6 card-shadow border border-gray-200/80 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-xs text-blue-600 font-semibold">
                  {hub.category}
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  {hub.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {hub.description}
                </p>
              </div>

              <button
                onClick={() => {
                  if (hub.presetBand && hub.presetPrompt && hub.targetTab === 'bands') {
                    onSelectTrend({
                      bandType: hub.presetBand,
                      prompt: hub.presetPrompt,
                    });
                  } else {
                    onNavigateTab(hub.targetTab);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {hub.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
