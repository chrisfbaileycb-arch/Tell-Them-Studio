import React, { useState } from 'react';
import { Hero } from '../Hero';
import { RadioStation, SongResult, PraiseComment } from '../../../types';
import { Icons, TOP_HANDOFF_PLATFORMS, createStudioCoverSvg } from '../../../constants';
import { validateKindnessAndSafety } from '../../utils/audioUtils';

interface StationsWorkspaceProps {
  stations: RadioStation[];
  setStations: React.Dispatch<React.SetStateAction<RadioStation[]>>;
  activeStationId: string | null;
  setActiveStationId: React.Dispatch<React.SetStateAction<string | null>>;
  results: SongResult[];
  creatorHandle: string;
  setSafetyFeedback: (msg: string | null) => void;
}

export const StationsWorkspace: React.FC<StationsWorkspaceProps> = ({
  stations,
  setStations,
  activeStationId,
  setActiveStationId,
  results,
  creatorHandle,
  setSafetyFeedback,
}) => {
  const [newStationName, setNewStationName] = useState('');
  const [newStationCallSign, setNewStationCallSign] = useState('');
  const [newStationGenre, setNewStationGenre] = useState('');
  const [newStationTagline, setNewStationTagline] = useState('');
  const [selectedStationTracks, setSelectedStationTracks] = useState<string[]>([]);
  const [stationBadgeDraft, setStationBadgeDraft] = useState<Record<string, PraiseComment['badge']>>({});
  const [stationPraiseDraft, setStationPraiseDraft] = useState<Record<string, string>>({});

  const handleCreateStation = () => {
    if (!newStationName.trim()) return;
    const stId = `station-${Date.now()}`;
    const newStation: RadioStation = {
      id: stId,
      name: newStationName.trim(),
      callSign: newStationCallSign.trim() || 'WSTN 99.1',
      genreFocus: newStationGenre.trim() || 'Eclectic & Live Band',
      tagline: newStationTagline.trim() || 'Broadcasting original studio songs and podcasts.',
      coverSvgUrl: createStudioCoverSvg('#1e1b4b', '#0f172a', '#38bdf8', 'radio'),
      creatorHandle,
      trackIds: selectedStationTracks,
      listenersCount: 1,
      thumbsUp: 0,
      syndicatedTo: ['Spotify', 'YouTube', 'Amazon Music'],
      praiseComments: [],
    };
    setStations((prev) => [newStation, ...prev]);
    setNewStationName('');
    setNewStationCallSign('');
    setNewStationGenre('');
    setNewStationTagline('');
    setSelectedStationTracks([]);
  };

  return (
    <section className="space-y-10 mb-14">
      <Hero
        eyebrow="Local playlist builder"
        title="Radio station preview"
        subtitle="Arrange music, podcasts, and commercials into a local station preview. This does not broadcast, publish, or syndicate your audio."
        ctaLabel="Build a preview"
        ctaHref="#station-builder"
      />

      <div id="station-builder" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 Cols: Station Builder */}
        <div className="lg:col-span-5 bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5">
          <h2 className="text-xl font-bold text-gray-900">
            Build a local station preview
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Try a station lineup in this session. Download your audio and upload it separately to external destinations.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Station Name
              </label>
              <input
                type="text"
                value={newStationName}
                onChange={(e) => setNewStationName(e.target.value)}
                placeholder="e.g., Steel City Band & Podcast Radio"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Station Call Sign
                </label>
                <input
                  type="text"
                  value={newStationCallSign}
                  onChange={(e) => setNewStationCallSign(e.target.value)}
                  placeholder="WKND 101.9"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Genre / Format Focus
                </label>
                <input
                  type="text"
                  value={newStationGenre}
                  onChange={(e) => setNewStationGenre(e.target.value)}
                  placeholder="Rock, Pop & Disco Bands"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Station Tagline & Schedule Note
              </label>
              <textarea
                value={newStationTagline}
                onChange={(e) => setNewStationTagline(e.target.value)}
                placeholder="Up to 3:50 multi-singer hits, Wednesday 7-min mini-podcasts, and local craft spots."
                className="w-full h-20 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Include Studio Creations in Rotation ({selectedStationTracks.length} selected)
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {results.map((r) => {
                  const checked = selectedStationTracks.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-200/70 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedStationTracks((prev) =>
                              checked
                                ? prev.filter((id) => id !== r.id)
                                : [...prev, r.id]
                            )
                          }
                        />
                        <span className="font-semibold text-gray-900 truncate">
                          {r.title || 'Untitled Creation'}
                        </span>
                      </div>
                      <span className="text-gray-500 font-mono tabular-nums shrink-0">
                        {r.maxCapLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCreateStation}
              disabled={!newStationName.trim()}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white apple-gradient shadow-md disabled:opacity-50"
            >
              Create local station preview
            </button>
          </div>
        </div>

        {/* Right 7 Cols: Active Radio Stations Directory */}
        <div className="lg:col-span-7 space-y-6">
          {stations.map((st) => {
            const isPlayingStation = activeStationId === st.id;
            const stationTracks = results.filter((r) =>
              st.trackIds.includes(r.id)
            );

            return (
              <div
                key={st.id}
                className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={st.coverSvgUrl}
                      alt={st.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-gray-200"
                    />
                    <div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-mono tabular-nums">
                        <span className="font-bold text-blue-600">{st.callSign}</span>
                        <span aria-hidden="true">·</span>
                        <span>Curated by {st.creatorHandle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{st.listenersCount} listeners</span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mt-0.5">
                        {st.name}
                      </h3>
                      <p className="text-xs text-gray-600 mt-1">{st.tagline}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        if (isPlayingStation) {
                          setActiveStationId(null);
                        } else {
                          setActiveStationId(st.id);
                          const firstTrack = stationTracks[0] || results[0];
                          if (firstTrack) {
                            const el = document.getElementById(
                              `audio-${firstTrack.id}`
                            ) as HTMLAudioElement | null;
                            if (el) el.play().catch(() => {});
                          }
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-white music-gradient flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      {isPlayingStation ? (
                        <>
                          <Icons.Pause className="w-4 h-4" />
                          <span>Stop Station Stream</span>
                        </>
                      ) : (
                        <>
                          <Icons.Radio className="w-4 h-4" />
                          <span>Tune In Live</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() =>
                        setStations((prev) =>
                          prev.map((s) =>
                            s.id === st.id ? { ...s, thumbsUp: s.thumbsUp + 1 } : s
                          )
                        )
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 flex items-center gap-1.5 font-mono tabular-nums"
                    >
                      <Icons.ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                      <span>{st.thumbsUp}</span>
                    </button>
                  </div>
                </div>

                {/* Clean unboxed metadata row */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span>Format: {st.genreFocus}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Demo destinations (not connected): {st.syndicatedTo.join(', ')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Rotation Queue: {stationTracks.length} items</span>
                </div>

                {/* Station Rotation List */}
                <div className="space-y-2">
                  {stationTracks.map((tr, i) => (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-gray-50 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-gray-400 tabular-nums">
                          0{i + 1}.
                        </span>
                        <span className="font-semibold text-gray-900 truncate">
                          {tr.title}
                        </span>
                        <span className="text-gray-500 truncate">
                          {tr.bandType} ({tr.originType})
                        </span>
                      </div>
                      <span className="font-mono text-gray-500 tabular-nums shrink-0">
                        {tr.maxCapLabel}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Station Creator Praise & Input */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={stationBadgeDraft[st.id] || 'Radio Ready'}
                      onChange={(e) =>
                        setStationBadgeDraft((prev) => ({
                          ...prev,
                          [st.id]: e.target.value as PraiseComment['badge'],
                        }))
                      }
                      className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700"
                    >
                      <option value="Radio Ready">Praise: Radio Ready</option>
                      <option value="Great Harmony">Praise: Great Harmony</option>
                      <option value="Question for Creator">Ask Creator a Question</option>
                    </select>
                    <input
                      type="text"
                      value={stationPraiseDraft[st.id] || ''}
                      onChange={(e) =>
                        setStationPraiseDraft((prev) => ({
                          ...prev,
                          [st.id]: e.target.value,
                        }))
                      }
                      placeholder={`Share kind feedback or ask a question as ${creatorHandle}...`}
                      className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                    />
                    <button
                      onClick={() => {
                        const msg = (stationPraiseDraft[st.id] || '').trim();
                        if (!msg) return;
                        const check = validateKindnessAndSafety(msg);
                        if (!check.valid) {
                          setSafetyFeedback(check.reason || 'Kindness check failed.');
                          return;
                        }
                        const comment: PraiseComment = {
                          id: Math.random().toString(36).substring(7),
                          handle: creatorHandle,
                          badge: stationBadgeDraft[st.id] || 'Radio Ready',
                          message: msg,
                          timestamp: 'Just now',
                        };
                        setStations((prev) =>
                          prev.map((s) =>
                            s.id === st.id
                              ? {
                                  ...s,
                                  praiseComments: [comment, ...s.praiseComments],
                                }
                              : s
                          )
                        );
                        setStationPraiseDraft((prev) => ({ ...prev, [st.id]: '' }));
                      }}
                      className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      Post Praise
                    </button>
                  </div>

                  {st.praiseComments.length > 0 && (
                    <div className="space-y-2">
                      {st.praiseComments.map((c) => (
                        <div
                          key={c.id}
                          className="text-xs text-gray-700 bg-gray-50/80 px-3.5 py-2 rounded-xl flex flex-wrap items-center gap-1.5"
                        >
                          <span className="font-mono font-semibold text-blue-600">
                            {c.handle}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-gray-900">
                            {c.badge}:
                          </span>
                          <span>{c.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 10 Direct Creator Handoff Destinations Directory */}
      <div className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-blue-600">
              Direct Creator Handoff Links · Zero Stored Keys or Credentials
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Top 10 Places to Publish Your Music & Podcasts
            </h2>
            <p className="text-xs text-gray-500 max-w-3xl leading-relaxed">
              We never hold your login credentials or third-party API keys. Use these direct handoff links to open your preferred destination, sign in with your own personal or artist account, and upload your downloaded studio master directly from your source to theirs.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-700 font-semibold shrink-0">
            100% Creator-Owned Login
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {TOP_HANDOFF_PLATFORMS.map((plat, idx) => (
            <div
              key={plat.id}
              className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/80 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="font-mono font-bold text-gray-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <span className="truncate">{plat.category}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900">{plat.name}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {plat.loginNote}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between gap-2">
                <a
                  href={plat.handoffUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold text-center transition-colors whitespace-nowrap"
                >
                  Handoff to {plat.name} ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
