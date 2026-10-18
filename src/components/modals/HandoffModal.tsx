import React from 'react';
import { SongResult, DistributionPlatformName } from '../../../types';
import { Icons, TOP_HANDOFF_PLATFORMS } from '../../../constants';

interface HandoffModalProps {
  publishTargetResult: SongResult | null;
  onClose: () => void;
  handoffNotice: string | null;
  onDismissNotice: () => void;
  onDownloadPackage: (result: SongResult) => void;
  onCopyMetadata: (result: SongResult, platform?: DistributionPlatformName) => void;
  onDownloadVideo: (result: SongResult, includeLyrics: boolean) => void;
  encodingVideoId: string | null;
  encodingProgress: number;
  onSyndicateToggle: (resultId: string, platform: DistributionPlatformName) => void;
}

export const HandoffModal: React.FC<HandoffModalProps> = ({
  publishTargetResult,
  onClose,
  handoffNotice,
  onDismissNotice,
  onDownloadPackage,
  onCopyMetadata,
  onDownloadVideo,
  encodingVideoId,
  encodingProgress,
  onSyndicateToggle,
}) => {
  if (!publishTargetResult) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[32px] max-w-3xl w-full p-8 card-shadow border border-gray-200 space-y-6 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-blue-600">
              Direct Creator Handoff · Zero Stored Logins or API Keys
            </div>
            <h3 className="text-2xl font-extrabold text-gray-900">
              Handoff "{publishTargetResult.title}" to Your Own Accounts
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Tell Them Studio never holds your platform credentials or API keys. Download your files, then open a destination and upload there yourself. Opening a link does not upload or publish anything. The optional checklist is your own note, not verified delivery.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:text-gray-900 shrink-0"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        {handoffNotice && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-between gap-3">
            <span>{handoffNotice}</span>
            <button
              onClick={onDismissNotice}
              className="text-emerald-700 font-bold hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Source Package & Pre-Flight Compliance Summary */}
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3 text-xs text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-gray-900">
              Step 1 — Grab Your Studio Source & Release Metadata:
            </span>
            <span className="font-mono font-bold text-emerald-700 tabular-nums">
              {publishTargetResult.maxCapLabel} · {publishTargetResult.originType}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onDownloadPackage(publishTargetResult)}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icons.Download className="w-3.5 h-3.5" />
              <span>Download WAV + Handoff Manifest</span>
            </button>
            <button
              onClick={() => onCopyMetadata(publishTargetResult)}
              className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-semibold whitespace-nowrap"
            >
              Copy Release Credits & Lyrics
            </button>
            <button
              onClick={() => onDownloadVideo(publishTargetResult, true)}
              disabled={encodingVideoId === publishTargetResult.id}
              className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icons.Video className="w-3.5 h-3.5 text-purple-600" />
              <span>
                {encodingVideoId === publishTargetResult.id
                  ? `Rendering Video ${Math.round(encodingProgress)}%`
                  : 'Export 1080p Video for YouTube'}
              </span>
            </button>
          </div>
        </div>

        {/* Step 2: Top 10 Destination Handoff Links */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-bold text-gray-800">
              Step 2 — Download, open a destination, and upload there manually
            </label>
            <span className="text-xs text-gray-500">
              Copies metadata & opens official creator login in a new tab
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TOP_HANDOFF_PLATFORMS.map((plat, index) => {
              const isPublished = publishTargetResult.publishedPlatforms.includes(
                plat.name
              );
              return (
                <div
                  key={plat.id}
                  className="flex flex-col justify-between p-4 rounded-2xl border border-gray-200 bg-white gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {index + 1}. {plat.name}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {plat.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {plat.loginNote}
                    </p>
                    <div className="text-[11px] font-mono text-gray-500">
                      Accepts: {plat.acceptedFormats}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <a
                      href={plat.handoffUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        onCopyMetadata(publishTargetResult, plat.name);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold text-center transition-colors whitespace-nowrap"
                    >
                      Open {plat.name} Handoff ↗
                    </a>
                    <button
                      onClick={() =>
                        onSyndicateToggle(publishTargetResult.id, plat.name)
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                        isPublished
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {isPublished ? 'Upload noted by you ✓' : 'I uploaded it'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
