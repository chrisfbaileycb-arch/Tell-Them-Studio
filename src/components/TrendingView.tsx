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
  Icons,
} from '../../constants';
import { BandArchetype, SongResult } from '../../types';

interface TrendingViewProps {
  results: SongResult[];
  onSelectTrend: (params: { bandType: BandArchetype; prompt: string }) => void;
}

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
}) => {
  const [genreMetric, setGenreMetric] = useState<
    'tracksCreated' | 'thumbsUp' | 'stationSpins'
  >('tracksCreated');
  const [themeMetric, setThemeMetric] = useState<'tracks' | 'praiseCount'>(
    'tracks'
  );

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
    <section className="space-y-10 mb-14">
      {/* Header & Summary KPI Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900"
            style={{ textWrap: 'balance' }}
          >
            Weekly Community Trends: Band Genres & Song Themes
          </h1>
          <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
            Real-time 7-day pulse (Oct 7 – Oct 13) of the most popular multi-singer band genres, vocal arrangements, and seasonal song themes created and syndicated across Tell Them Studio.
          </p>
        </div>

        <div className="text-xs text-gray-500 font-mono tabular-nums shrink-0">
          Window: Last 7 Days · All Tracks ≤ 2:48
        </div>
      </div>

      {/* 4-Column Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 card-shadow space-y-1">
          <div className="text-xs text-gray-500">7-Day Band Tracks Created</div>
          <div className="text-3xl font-extrabold text-gray-900 font-mono tabular-nums">
            {totalWeeklyTracks.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            Top Lineup: Rock & Country Duets
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
            Creators singing over band instrumentals
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
                Most Popular Band Genres (Last 7 Days)
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
            <span className="font-mono tabular-nums">Max Song Cap: 2:48</span>
          </div>
        </div>

        {/* Chart 2: Most Popular Song Themes */}
        <div className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Trending Song Themes & Seasonal Topics
              </h2>
              <p className="text-xs text-gray-500">
                Original hometown game-day anthems, Halloween blitz & early Christmas prep
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
            <span>Fastest Rising: Early-Bird Christmas Duets (+48% since Oct 10)</span>
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
              Daily community output across Rock/Country Bands, Pop/Disco Groups, and Holiday Specials
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
                  name="Pop & Disco Ensembles"
                  stroke="#9333ea"
                  fill="#f3e8ff"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="holidaySpecials"
                  name="Halloween & Christmas"
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
                Click any trending theme below to pre-configure the Band Studio with that lineup
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
                              prompt: `Create an upbeat, radio-ready ${mappedBand} song inspired by the trending community theme "${row.theme}" with male and female multi-singer vocals trading verses and a memorable chorus. Capped at 2:48.`,
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
    </section>
  );
};
