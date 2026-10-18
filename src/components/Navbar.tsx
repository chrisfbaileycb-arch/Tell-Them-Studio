import React from 'react';
import { AudioLines, Music2, Mic, Megaphone, Sparkles } from 'lucide-react';
import { StudioTab } from '../../types';
import { Icons } from '../../constants';

interface NavbarProps {
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;
  isCreate: boolean;
  onOpenStandards: () => void;
  creatorHandle: string;
  setCreatorHandle: (handle: string) => void;
  isEditingHandle: boolean;
  setIsEditingHandle: (val: boolean) => void;
  handleDraft: string;
  setHandleDraft: (val: string) => void;
  draftError: boolean;
  safetyFeedback: string | null;
  setSafetyFeedback: (val: string | null) => void;
  communityNotice: string | null;
  setCommunityNotice: (val: string | null) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isCreate,
  onOpenStandards,
  creatorHandle,
  setCreatorHandle,
  isEditingHandle,
  setIsEditingHandle,
  handleDraft,
  setHandleDraft,
  draftError,
  safetyFeedback,
  setSafetyFeedback,
  communityNotice,
  setCommunityNotice,
}) => {
  return (
    <>
      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-50 glass border-b border-gray-200/70 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('bands');
          }}
          className="studio-wordmark"
        >
          <AudioLines size={36} strokeWidth={2.3} aria-hidden="true" />Tell Them Studio
        </a>

        <nav aria-label="Main navigation" className="order-3 w-full sm:order-none sm:w-auto flex flex-wrap gap-2 text-sm">
          {[
            { label: 'Create', tab: 'bands', active: isCreate },
            { label: 'My Library', tab: 'library', active: activeTab === 'library' },
            { label: 'Listen', tab: 'listen', active: !isCreate && activeTab !== 'library' },
          ].map((item) => (
            <button
              key={item.tab}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setActiveTab(item.tab as StudioTab)}
              className={`rounded-xl px-3 py-2 font-semibold ${
                item.active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={onOpenStandards}
            className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0"
          >
            Guidelines
          </button>
        </div>
      </header>

      {/* Workspace Toolbar: Handle Identity, Mobile Tab Switcher & Notices */}
      <div className="studio-identity flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-900">Creator Handle:</span>
          {isEditingHandle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value)}
                className="px-2.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900"
                placeholder="@your_handle"
              />
              <button
                onClick={() => {
                  const cleaned = handleDraft.trim().startsWith('@')
                    ? handleDraft.trim().replace(/\s+/g, '_')
                    : `@${handleDraft.trim().replace(/\s+/g, '_')}`;
                  if (cleaned.length > 2) setCreatorHandle(cleaned);
                  setIsEditingHandle(false);
                }}
                className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold"
              >
                Save Handle
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setHandleDraft(creatorHandle);
                setIsEditingHandle(true);
              }}
              className="font-mono font-semibold text-blue-600 hover:underline"
            >
              {creatorHandle} (Change Handle)
            </button>
          )}
          <span>Drafts and library stay in this browser.</span>
        </div>
      </div>

      {draftError && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">
          Draft saving is unavailable or storage is full. Keep this page open and copy your text before leaving.
        </p>
      )}

      {activeTab !== 'library' && (
        <nav aria-label={isCreate ? 'Creation tools' : 'Listening tools'} className="mb-6 flex flex-wrap gap-2">
          {(isCreate
            ? [
                { id: 'bands', label: 'Music' },
                { id: 'podcasts', label: 'Podcasts' },
                { id: 'commercials', label: 'Commercials' },
                { id: 'creative', label: 'Creative assistant' },
              ]
            : [
                { id: 'listen', label: 'Discover' },
                { id: 'stations', label: 'Radio preview' },
                { id: 'trending', label: 'Featured demos' },
              ]
          ).map((item) => (
            <button
              key={item.id}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => setActiveTab(item.id as StudioTab)}
              className={`rounded-xl border px-4 py-2 text-sm ${
                activeTab === item.id
                  ? 'border-gray-900 bg-gray-100 font-semibold'
                  : 'border-gray-200'
              }`}
            >
              {item.id === 'bands' ? (
                <Music2 size={21} />
              ) : item.id === 'podcasts' ? (
                <Mic size={21} />
              ) : item.id === 'commercials' ? (
                <Megaphone size={21} />
              ) : item.id === 'creative' ? (
                <Sparkles size={21} />
              ) : null}
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {['listen', 'stations', 'trending'].includes(activeTab) && (
        <p className="mb-4 text-sm text-gray-600">
          Local listening preview · demo activity and this browser’s shared tracks. Nothing is published online.
        </p>
      )}

      {/* Kindness & Safety Alert Banner */}
      {safetyFeedback && (
        <div className="mb-8 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4 text-sm text-amber-900">
          <div className="flex items-center gap-3">
            <Icons.ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
            <span>{safetyFeedback}</span>
          </div>
          <button
            onClick={() => setSafetyFeedback(null)}
            className="px-3 py-1 text-xs font-semibold bg-white border border-amber-200 rounded-lg hover:bg-amber-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {communityNotice && (
        <div role="status" className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4 text-sm text-emerald-950">
          <span>{communityNotice}</span>
          <div className="flex items-center gap-2 shrink-0">
            {activeTab !== 'listen' && (
              <button
                type="button"
                onClick={() => setActiveTab('listen')}
                className="px-3 py-1 text-xs font-bold bg-gray-900 text-white rounded-lg"
              >
                Open Listen Showcase ↗
              </button>
            )}
            <button
              type="button"
              onClick={() => setCommunityNotice(null)}
              className="px-3 py-1 text-xs font-semibold bg-white border border-emerald-200 rounded-lg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
};
