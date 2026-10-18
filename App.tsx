import './src/components/studio.css';
import React, { useState, useEffect } from 'react';
import { StudioTab } from './types';
import { useDraft } from './src/hooks/useDraft';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PlaybackProvider, usePlayback } from './src/context/PlaybackContext';
import { useStudioState } from './src/hooks/useStudioState';
import { Navbar } from './src/components/Navbar';
import { WorkspaceRouter } from './src/components/workspaces/WorkspaceRouter';
import { HandoffModal } from './src/components/modals/HandoffModal';
import { StandardsModal } from './src/components/modals/StandardsModal';
import { PersistentCommunityPlayer } from './src/components/PublicCommunityShowcase';

const normalizeRoute = (route: string): StudioTab => {
  if (route === 'singers' || route === 'acoustic' || route === 'create') return 'bands';
  return ['bands', 'stations', 'podcasts', 'commercials', 'holidays', 'trending', 'listen', 'library', 'creative'].includes(route)
    ? (route as StudioTab)
    : 'bands';
};

const AppContent: React.FC = () => {
  // Global Audio Playback Orchestration
  const playback = usePlayback();

  // Active workspace tab & draft preset
  const [activeTab, setActiveTab] = useState<StudioTab>(() => normalizeRoute(window.location.hash.slice(1)));
  const [, setMusicPreset] = useDraft('music-preset', () =>
    ['singers', 'acoustic'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'bands'
  );
  const [draftError, setDraftError] = useState(false);

  // Studio Domain State & Workflow Orchestration
  const studio = useStudioState(setActiveTab);

  useEffect(() => {
    const onRoute = () => {
      const route = window.location.hash.slice(1);
      if (route === 'singers' || route === 'acoustic') setMusicPreset(route);
      setActiveTab(normalizeRoute(route));
    };
    const onDraftError = () => setDraftError(true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('studio-draft-error', onDraftError);
    return () => {
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('studio-draft-error', onDraftError);
    };
  }, [setMusicPreset]);

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeTab}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  const createTabs = ['bands', 'podcasts', 'commercials', 'creative', 'holidays'];
  const isCreate = createTabs.includes(activeTab);

  return (
    <div
      id="top"
      className="studio-app min-h-screen flex flex-col pb-24 font-geist relative"
      onClick={() => studio.setActiveSelector(null)}
    >
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCreate={isCreate}
        onOpenStandards={() => studio.setIsStandardsModalOpen(true)}
        creatorHandle={studio.creatorHandle}
        setCreatorHandle={studio.setCreatorHandle}
        isEditingHandle={studio.isEditingHandle}
        setIsEditingHandle={studio.setIsEditingHandle}
        handleDraft={studio.handleDraft}
        setHandleDraft={studio.setHandleDraft}
        draftError={draftError}
        safetyFeedback={studio.safetyFeedback}
        setSafetyFeedback={studio.setSafetyFeedback}
        communityNotice={studio.communityNotice}
        setCommunityNotice={studio.setCommunityNotice}
      />

      <main className="studio-main flex-1 mx-auto w-full">
        <ErrorBoundary fallbackTitle="An error occurred in this workspace.">
          <WorkspaceRouter
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            studio={studio}
            playback={playback}
          />
        </ErrorBoundary>
      </main>

      <HandoffModal
        publishTargetResult={studio.publishTargetResult}
        onClose={() => studio.setPublishTargetResult(null)}
        handoffNotice={studio.handoffNotice}
        onDismissNotice={() => studio.setHandoffNotice(null)}
        onDownloadPackage={studio.handleDownloadHandoffPackage}
        onCopyMetadata={studio.handleCopyHandoffMetadata}
        onDownloadVideo={studio.onDownloadVideo}
        encodingVideoId={studio.encodingVideoId}
        encodingProgress={studio.encodingProgress}
        onSyndicateToggle={studio.handleSyndicateToggle}
      />

      <StandardsModal
        isOpen={studio.isStandardsModalOpen}
        onClose={() => studio.setIsStandardsModalOpen(false)}
      />

      <PersistentCommunityPlayer
        track={playback.persistentTrack}
        audioRef={playback.persistentAudioRef}
        isPlaying={playback.persistentPlaying}
        currentTime={playback.persistentTime}
        duration={playback.persistentDuration}
        onTogglePlay={playback.togglePlay}
        onSeek={playback.seekTo}
        onClose={playback.closePersistentPlayer}
        onTimeUpdate={playback.setPersistentTime}
        onDurationChange={playback.setPersistentDuration}
        onPlayStateChange={playback.setPersistentPlaying}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PlaybackProvider>
      <AppContent />
    </PlaybackProvider>
  );
};

export default App;
