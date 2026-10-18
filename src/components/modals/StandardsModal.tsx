import React from 'react';
import { Icons } from '../../../constants';

interface StandardsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StandardsModal: React.FC<StandardsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[32px] max-w-2xl w-full p-8 card-shadow border border-gray-200 space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-gray-900">
              Tell Them Studio Charter: Artist Respect, Safety & Standards
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Built for joyful creation, honest labeling, and community kindness.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:text-gray-900"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-gray-700 leading-relaxed">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <h4 className="font-bold text-sm text-gray-900 mb-1">
              1. Mandatory AI Identifier & Respect for Lifelong Human Musicians
            </h4>
            <p>
              Every track generated without human instruments or human vocals carries a permanent{' '}
              <strong>AI-Generated Material</strong> identifier in both the UI and exported videos. Creators who sing or play over instrumental backing tracks receive the{' '}
              <strong>Human Voice + AI Backing Band</strong> badge—honoring artists who dedicate their lives to their craft while empowering new voices.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <h4 className="font-bold text-sm text-gray-900 mb-1">
              2. Hometown & Fan Songs Without Copyright or Trademark Infringement
            </h4>
            <p>
              Want to make an upbeat game-day rock anthem for your favorite city? Celebrate hometown colors, rivers, bridges, and Friday night energy using 100% original melodies and lyrics without copying copyrighted songs or registered franchise trademarks.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <h4 className="font-bold text-sm text-gray-900 mb-1">
              3. Duration targets & optional release planning
            </h4>
            <p>
              Songs, jingles, and podcast lengths are generation targets. Check the finished audio before export. Release plans in the studio are notes only. With the community service connected, My Library can publish a real RSS feed and publish podcast episodes on a weekly schedule; this app never uploads to Spotify, Apple, YouTube or any other directory for you, so you submit the feed URL yourself.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <h4 className="font-bold text-sm text-gray-900 mb-1">
              4. Handle-Only Safety, PG Commercial Craft & Zero Put-Downs
            </h4>
            <p>
              All interactions happen under studio handles (<code>@handle</code>) with no personal data exposure. Commercials celebrate authentic advertising craft (never deceptive deepfake avatars) under strict family-safe PG standards, and our Kindness Filter blocks negative put-downs.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold"
          >
            Got It — Back to Studio
          </button>
        </div>
      </div>
    </div>
  );
};
