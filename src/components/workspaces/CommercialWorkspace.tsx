import React from 'react';
import { Icons } from '../../../constants';

interface CommercialWorkspaceProps {
  adBrandName: string;
  setAdBrandName: (val: string) => void;
  adOffering: string;
  setAdOffering: (val: string) => void;
  adAudience: string;
  setAdAudience: (val: string) => void;
  adTone: string;
  setAdTone: (val: string) => void;
  adCta: string;
  setAdCta: (val: string) => void;
  adSpotLength: '30s' | '60s';
  setAdSpotLength: (val: '30s' | '60s') => void;
  adVoice: string;
  setAdVoice: (val: string) => void;
  adStandardsPledge: boolean;
  setAdStandardsPledge: (val: boolean) => void;
  isGeneratingCommercial: boolean;
  onGenerateCommercial: () => void;
}

export const CommercialWorkspace: React.FC<CommercialWorkspaceProps> = ({
  adBrandName,
  setAdBrandName,
  adOffering,
  setAdOffering,
  adAudience,
  setAdAudience,
  adTone,
  setAdTone,
  adCta,
  setAdCta,
  adSpotLength,
  setAdSpotLength,
  adVoice,
  setAdVoice,
  adStandardsPledge,
  setAdStandardsPledge,
  isGeneratingCommercial,
  onGenerateCommercial,
}) => {
  return (
    <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 space-y-8">
      <div className="space-y-3">
        <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
          Authentic Advertising Craft · PG Broadcast Standards
        </span>
        <h1
          className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-3xl md:text-5xl font-semibold tracking-tighter text-transparent py-1"
          style={{ textWrap: 'balance' }}
        >
          True Craft Commercial Studio
        </h1>
        <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed tracking-tight">
          Dedicated to the real craft of radio and broadcast advertising—memorable copywriting, sonic branding, and clear storytelling. Strictly zero fake celebrity avatars or deceptive impersonations, with built-in PG / Family-Safe broadcast standards.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Brand, Show, or Local Business Name
            </label>
            <input
              type="text"
              value={adBrandName}
              onChange={(e) => setAdBrandName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              What Makes It Special (Authentic Value Proposition)
            </label>
            <textarea
              value={adOffering}
              onChange={(e) => setAdOffering(e.target.value)}
              className="w-full h-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Target Listeners
              </label>
              <input
                type="text"
                value={adAudience}
                onChange={(e) => setAdAudience(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Creative Tone
              </label>
              <input
                type="text"
                value={adTone}
                onChange={(e) => setAdTone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-200/80 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Call to Action (CTA)
            </label>
            <input
              type="text"
              value={adCta}
              onChange={(e) => setAdCta(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Broadcast Spot Length
              </label>
              <div className="flex bg-white p-1 rounded-xl border border-gray-200">
                {(['30s', '60s'] as ('30s' | '60s')[]).map((len) => (
                  <button
                    key={len}
                    onClick={() => setAdSpotLength(len)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums ${
                      adSpotLength === len
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600'
                    }`}
                  >
                    :{len} Spot
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Narrator Voice Craft
              </label>
              <select
                value={adVoice}
                onChange={(e) => setAdVoice(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
              >
                <option value="Fenrir">Fenrir (Classic Radio Warmth)</option>
                <option value="Kore">Kore (Crisp Modern Agency)</option>
                <option value="Puck">Puck (Upbeat Retail Energy)</option>
                <option value="Zephyr">Zephyr (Smooth Storyteller)</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-gray-200 cursor-pointer text-xs text-gray-600 leading-relaxed">
            <input
              type="checkbox"
              checked={adStandardsPledge}
              onChange={(e) => setAdStandardsPledge(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600"
            />
            <span>
              <strong className="text-gray-900">Authentic Advertising & PG Broadcast Standards:</strong>{' '}
              This commercial represents genuine advertising craft—no fake avatars pretending to be someone else, zero offensive language, and full compliance with family-safe radio guidelines.
            </span>
          </label>

          <button
            onClick={onGenerateCommercial}
            disabled={isGeneratingCommercial || !adStandardsPledge}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white creative-gradient shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGeneratingCommercial ? (
              <>
                <Icons.Loading className="w-4 h-4 animate-spin" />
                <span>Producing Commercial Voiceover & Storyboard...</span>
              </>
            ) : (
              <span>Produce :{adSpotLength} Broadcast Commercial & Storyboard</span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
