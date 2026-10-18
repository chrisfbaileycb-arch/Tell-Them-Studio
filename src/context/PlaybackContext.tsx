import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { CommunityFeedItem } from '../../types';

interface PlaybackContextType {
  persistentTrack: CommunityFeedItem | null;
  persistentPlaying: boolean;
  persistentTime: number;
  persistentDuration: number;
  persistentAudioRef: React.RefObject<HTMLAudioElement | null>;
  setPersistentTrack: React.Dispatch<React.SetStateAction<CommunityFeedItem | null>>;
  setPersistentPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setPersistentTime: React.Dispatch<React.SetStateAction<number>>;
  setPersistentDuration: React.Dispatch<React.SetStateAction<number>>;
  handlePlayCommunityTrack: (item: CommunityFeedItem) => void;
  handleSeekCommunityTrack: (item: CommunityFeedItem, timeSec: number) => void;
  togglePlay: () => void;
  seekTo: (timeSec: number) => void;
  closePersistentPlayer: () => void;
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

export const PlaybackProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [persistentTrack, setPersistentTrack] = useState<CommunityFeedItem | null>(null);
  const [persistentPlaying, setPersistentPlaying] = useState(false);
  const [persistentTime, setPersistentTime] = useState(0);
  const [persistentDuration, setPersistentDuration] = useState(0);
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayCommunityTrack = (item: CommunityFeedItem) => {
    if (!item.audioUrl) return;
    if (persistentTrack?.id === item.id) {
      if (persistentPlaying) {
        persistentAudioRef.current?.pause();
        setPersistentPlaying(false);
      } else {
        persistentAudioRef.current?.play().catch(() => {});
        setPersistentPlaying(true);
      }
      return;
    }
    setPersistentTrack(item);
    setPersistentPlaying(true);
    setPersistentTime(0);
    setPersistentDuration(0);
  };

  const handleSeekCommunityTrack = (item: CommunityFeedItem, timeSec: number) => {
    if (persistentTrack?.id !== item.id) {
      setPersistentTrack(item);
      setPersistentPlaying(true);
    }
    if (persistentAudioRef.current) {
      persistentAudioRef.current.currentTime = timeSec;
    }
    setPersistentTime(timeSec);
  };

  const togglePlay = () => {
    const el = persistentAudioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPersistentPlaying(true);
    } else {
      el.pause();
      setPersistentPlaying(false);
    }
  };

  const seekTo = (timeSec: number) => {
    if (persistentAudioRef.current) {
      persistentAudioRef.current.currentTime = timeSec;
    }
    setPersistentTime(timeSec);
  };

  const closePersistentPlayer = () => {
    persistentAudioRef.current?.pause();
    setPersistentPlaying(false);
    setPersistentTrack(null);
  };

  return (
    <PlaybackContext.Provider
      value={{
        persistentTrack,
        persistentPlaying,
        persistentTime,
        persistentDuration,
        persistentAudioRef,
        setPersistentTrack,
        setPersistentPlaying,
        setPersistentTime,
        setPersistentDuration,
        handlePlayCommunityTrack,
        handleSeekCommunityTrack,
        togglePlay,
        seekTo,
        closePersistentPlayer,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = (): PlaybackContextType => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};
