import React from 'react';
import { Icons } from '../../../constants';
import { PodcastSamples } from '../CreativeWorkspace';

interface PodcastWorkspaceProps {
  podcastShowTitle: string;
  setPodcastShowTitle: (val: string) => void;
  podcastTopic: string;
  setPodcastTopic: (val: string) => void;
  podcastHostA: string;
  setPodcastHostA: (val: string) => void;
  podcastHostAVoice: string;
  setPodcastHostAVoice: (val: string) => void;
  podcastHostB: string;
  setPodcastHostB: (val: string) => void;
  podcastHostBVoice: string;
  setPodcastHostBVoice: (val: string) => void;
  podcastTargetMinutes: number;
  setPodcastTargetMinutes: (val: number) => void;
  podcastDay: string;
  setPodcastDay: (val: string) => void;
  podcastTime: string;
  setPodcastTime: (val: string) => void;
  isGeneratingPodcast: boolean;
  onGeneratePodcast: () => void;
  onNavigateTab: (tab: 'library' | 'creative') => void;
}

export const PodcastWorkspace: React.FC<PodcastWorkspaceProps> = ({
  podcastShowTitle,
  setPodcastShowTitle,
  podcastTopic,
  setPodcastTopic,
  podcastHostA,
  setPodcastHostA,
  podcastHostAVoice,
  setPodcastHostAVoice,
  podcastHostB,
  setPodcastHostB,
  podcastHostBVoice,
  setPodcastHostBVoice,
  podcastTargetMinutes,
  setPodcastTargetMinutes,
  podcastDay,
  setPodcastDay,
  podcastTime,
  setPodcastTime,
  isGeneratingPodcast,
  onGeneratePodcast,
  onNavigateTab,
}) => {
  return (
    <>
      <details className="mb-4">
        <summary>Listen to podcast sketches</summary>
        <PodcastSamples />
      </details>
      <div className="cw cw-actions">
        <button onClick={() => onNavigateTab('library')}>Your podcast library ↗</button>
        <button onClick={() => onNavigateTab('creative')}>Discuss an episode idea ↗</button>
      </div>

      <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 space-y-8">
        <div className="space-y-3">
          <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
            Create a conversation · 5–10 minute target
          </span>
          <h1
            className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-3xl md:text-5xl font-semibold tracking-tighter text-transparent py-1"
            style={{ textWrap: 'balance' }}
          >
            Podcast studio
          </h1>
          <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed tracking-tight">
            Designed for high-value, consistent weekly episodes between 5 and 10 minutes—never 15 two-minute spam clips a day. Includes dual-host conversational synthesis and 1080p podcast video rendering for Spotify, YouTube, and Amazon Music.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Podcast Series Title
              </label>
              <input
                type="text"
                value={podcastShowTitle}
                onChange={(e) => setPodcastShowTitle(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Episode Topic & Key Talking Points
              </label>
              <textarea
                value={podcastTopic}
                onChange={(e) => setPodcastTopic(e.target.value)}
                className="w-full h-28 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Host 1 Name & Voice
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={podcastHostA}
                    onChange={(e) => setPodcastHostA(e.target.value)}
                    className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                  />
                  <select
                    value={podcastHostAVoice}
                    onChange={(e) => setPodcastHostAVoice(e.target.value)}
                    className="w-1/2 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                  >
                    <option value="Puck">Puck (Bright)</option>
                    <option value="Fenrir">Fenrir (Warm)</option>
                    <option value="Charon">Charon (Deep)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Host 2 Name & Voice
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={podcastHostB}
                    onChange={(e) => setPodcastHostB(e.target.value)}
                    className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                  />
                  <select
                    value={podcastHostBVoice}
                    onChange={(e) => setPodcastHostBVoice(e.target.value)}
                    className="w-1/2 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                  >
                    <option value="Kore">Kore (Articulate)</option>
                    <option value="Zephyr">Zephyr (Smooth)</option>
                    <option value="Puck">Puck (Upbeat)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Duration Guardrail (5-10m) & Optional Release Plan */}
          <div className="bg-gray-50 rounded-3xl p-6 border border-gray-200/80 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-900">
                  Episode Duration Guardrail (5 to 10 Minutes Max)
                </label>
                <span className="font-mono text-sm font-bold text-blue-600 tabular-nums">
                  {podcastTargetMinutes}:00 Mins
                </span>
              </div>
              <div className="flex gap-2">
                {[5, 7, 10].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setPodcastTargetMinutes(mins)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold font-mono tabular-nums border transition-all ${
                      podcastTargetMinutes === mins
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {mins} Min {mins === 10 ? '(Max Cap)' : mins === 7 ? '(Sweet Spot)' : '(Min)'}
                  </button>
                ))}
              </div>
            </div>

            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Optional release plan · notes only, no automatic scheduling
              </summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Planned release day
                  </label>
                  <select
                    value={podcastDay}
                    onChange={(e) => setPodcastDay(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
                  >
                    <option>Every Monday</option>
                    <option>Every Tuesday</option>
                    <option>Every Wednesday</option>
                    <option>Every Thursday</option>
                    <option>Every Friday</option>
                    <option>Every Saturday</option>
                    <option>Every Sunday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Planned release time
                  </label>
                  <select
                    value={podcastTime}
                    onChange={(e) => setPodcastTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                  >
                    <option>07:00 AM EST</option>
                    <option>08:00 AM EST</option>
                    <option>12:00 PM EST</option>
                    <option>05:00 PM EST</option>
                    <option>08:00 PM EST</option>
                  </select>
                </div>
              </div>
            </details>

            <button
              onClick={onGeneratePodcast}
              disabled={isGeneratingPodcast}
              className="w-full py-4 rounded-2xl text-sm font-bold text-white apple-gradient shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeneratingPodcast ? (
                <>
                  <Icons.Loading className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Dual-Host Episode & Video Script...</span>
                </>
              ) : (
                <span>Produce {podcastTargetMinutes}-Min Podcast</span>
              )}
            </button>
          </div>
        </div>
      </section>
    </>
  );
};
