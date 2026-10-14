import React, { useState } from 'react';
import { ExampleSong } from '../../types';
import { Icons, createStudioCoverSvg } from '../../constants';

interface SongCardProps {
  song: ExampleSong;
  onPlay: (song: ExampleSong) => void;
  isPlaying: boolean;
}

const SongCard: React.FC<SongCardProps> = ({ song, onPlay, isPlaying }) => {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="group relative bg-white rounded-3xl overflow-hidden card-shadow border border-gray-200/80 transition-all duration-200 transform hover:-translate-y-0.5">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={song.coverUrl || createStudioCoverSvg('#1e1b4b', '#7f1d1d', '#f59e0b', 'band')}
          alt={song.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <button
            onClick={() => onPlay(song)}
            className="w-14 h-14 bg-white/95 backdrop-blur rounded-full flex items-center justify-center text-black transition-transform transform hover:scale-105 active:scale-95 shadow-xl"
            aria-label={isPlaying ? 'Pause song' : 'Play song'}
          >
            {isPlaying ? <Icons.Pause className="w-7 h-7" /> : <Icons.Play className="w-7 h-7 ml-0.5" />}
          </button>
        </div>

        <div className="absolute top-4 right-4">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className={`p-2 rounded-full backdrop-blur-md transition-all ${
              showPrompt ? 'bg-blue-600 text-white' : 'bg-white/30 text-white hover:bg-white/50'
            }`}
            aria-label="Show generation prompt"
          >
            <Icons.Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-base font-bold tracking-tight truncate pr-4 text-gray-900">
            {song.title}
          </h3>
          <span className="text-xs font-mono tabular-nums text-gray-500 mt-0.5">
            {song.duration}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          {song.artist} · {song.handle}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {song.tags.map((tag, idx) => (
            <React.Fragment key={tag}>
              {idx > 0 && <span aria-hidden="true">·</span>}
              <span>{tag}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {showPrompt && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur p-6 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-gray-500">Studio Prompt</h4>
            <button
              onClick={() => setShowPrompt(false)}
              className="text-gray-400 hover:text-black"
              aria-label="Close prompt overlay"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-gray-700 flex-1 overflow-y-auto">
            "{song.prompt}"
          </p>
        </div>
      )}
    </div>
  );
};

export default SongCard;
