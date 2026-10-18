import React from 'react';
import { StudioTab } from '../../../types';
import { useStudioState } from '../../hooks/useStudioState';
import { usePlayback } from '../../context/PlaybackContext';
import { PublicCommunityShowcase } from '../PublicCommunityShowcase';
import { CreativeWorkspace } from '../CreativeWorkspace';
import { MusicWorkspace } from './MusicWorkspace';
import { StationsWorkspace } from './StationsWorkspace';
import { PodcastWorkspace } from './PodcastWorkspace';
import { CommercialWorkspace } from './CommercialWorkspace';
import { HolidayWorkspace } from './HolidayWorkspace';
import { TrendingView } from '../TrendingView';
import { StudioGallery } from './StudioGallery';

interface WorkspaceRouterProps {
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;
  studio: ReturnType<typeof useStudioState>;
  playback: ReturnType<typeof usePlayback>;
}

export const WorkspaceRouter: React.FC<WorkspaceRouterProps> = ({
  activeTab,
  setActiveTab,
  studio,
  playback,
}) => {
  return (
    <>
      {activeTab === 'listen' && (
        <PublicCommunityShowcase
          feed={studio.communityFeed}
          activeTrack={playback.persistentTrack}
          isPlaying={playback.persistentPlaying}
          currentTime={playback.persistentTime}
          duration={playback.persistentDuration}
          onPlayTrack={playback.handlePlayCommunityTrack}
          onSeekTrack={playback.handleSeekCommunityTrack}
        />
      )}

      {(['listen', 'library', 'creative'] as string[]).includes(activeTab) && (
        <CreativeWorkspace
          mode={activeTab as 'listen' | 'library' | 'creative'}
          owner={studio.creatorHandle}
          onCreate={(band, brief) => {
            studio.handleSelectBandArchetype(band);
            studio.setPrompt(brief);
            studio.setIsHelperOpen(false);
            setActiveTab('bands');
          }}
          onPodcast={() => setActiveTab('podcasts')}
          onLyrics={(lyrics) => {
            studio.setCustomLyrics(lyrics);
            studio.setLyricsOption('Custom');
            studio.setIsHelperOpen(false);
            setActiveTab('bands');
          }}
        />
      )}

      {activeTab === 'bands' && (
        <MusicWorkspace
          selectedBand={studio.selectedBand}
          handleSelectBandArchetype={studio.handleSelectBandArchetype}
          vocalArrangement={studio.vocalArrangement}
          setVocalArrangement={studio.setVocalArrangement}
          prompt={studio.prompt}
          setPrompt={studio.setPrompt}
          setIsPromptManual={studio.setIsPromptManual}
          duration={studio.duration}
          setDuration={studio.setDuration}
          lyricsOption={studio.lyricsOption}
          setLyricsOption={studio.setLyricsOption}
          customLyrics={studio.customLyrics}
          setCustomLyrics={studio.setCustomLyrics}
          customGenreName={studio.customGenreName}
          setCustomGenreName={studio.setCustomGenreName}
          selectedImages={studio.selectedImages}
          handleImageUpload={studio.handleImageUpload}
          removeImage={studio.removeImage}
          handleGenerate={() => studio.handleGenerate()}
          isGenerating={studio.gen.results.some((r) => r.status === 'generating')}
          ipRespectConfirmed={studio.ipRespectConfirmed}
          setIpRespectConfirmed={studio.setIpRespectConfirmed}
          featuredTrack={studio.featuredTrack}
          handleDownload={studio.handleDownload}
          handlePublishToCommunity={studio.handlePublishToCommunity}
          isFeaturedPublished={
            !!studio.featuredTrack &&
            studio.communityFeed.some(
              (item) => item.id === studio.featuredTrack?.id && !studio.featuredTrack?.id.startsWith('seed-')
            )
          }
          isHelperOpen={studio.isHelperOpen}
          setIsHelperOpen={studio.setIsHelperOpen}
          helperSections={studio.helperSections}
          setHelperSections={studio.setHelperSections}
          activeSelector={studio.activeSelector}
          setActiveSelector={studio.setActiveSelector}
          fileInputRef={studio.fileInputRef}
          creatorHandle={studio.creatorHandle}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'stations' && (
        <StationsWorkspace
          stations={studio.stations}
          setStations={studio.setStations}
          activeStationId={studio.activeStationId}
          setActiveStationId={studio.setActiveStationId}
          results={studio.gen.results}
          creatorHandle={studio.creatorHandle}
          setSafetyFeedback={studio.setSafetyFeedback}
        />
      )}

      {activeTab === 'podcasts' && (
        <PodcastWorkspace
          podcastShowTitle={studio.podcastShowTitle}
          setPodcastShowTitle={studio.setPodcastShowTitle}
          podcastTopic={studio.podcastTopic}
          setPodcastTopic={studio.setPodcastTopic}
          podcastHostA={studio.podcastHostA}
          setPodcastHostA={studio.setPodcastHostA}
          podcastHostAVoice={studio.podcastHostAVoice}
          setPodcastHostAVoice={studio.setPodcastHostAVoice}
          podcastHostB={studio.podcastHostB}
          setPodcastHostB={studio.setPodcastHostB}
          podcastHostBVoice={studio.podcastHostBVoice}
          setPodcastHostBVoice={studio.setPodcastHostBVoice}
          podcastTargetMinutes={studio.podcastTargetMinutes}
          setPodcastTargetMinutes={studio.setPodcastTargetMinutes}
          podcastDay={studio.podcastDay}
          setPodcastDay={studio.setPodcastDay}
          podcastTime={studio.podcastTime}
          setPodcastTime={studio.setPodcastTime}
          isGeneratingPodcast={studio.isGeneratingPodcast}
          onGeneratePodcast={studio.handleGeneratePodcast}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'commercials' && (
        <CommercialWorkspace
          adBrandName={studio.adBrandName}
          setAdBrandName={studio.setAdBrandName}
          adOffering={studio.adOffering}
          setAdOffering={studio.setAdOffering}
          adAudience={studio.adAudience}
          setAdAudience={studio.setAdAudience}
          adTone={studio.adTone}
          setAdTone={studio.setAdTone}
          adCta={studio.adCta}
          setAdCta={studio.setAdCta}
          adSpotLength={studio.adSpotLength}
          setAdSpotLength={studio.setAdSpotLength}
          adVoice={studio.adVoice}
          setAdVoice={studio.setAdVoice}
          adStandardsPledge={studio.adStandardsPledge}
          setAdStandardsPledge={studio.setAdStandardsPledge}
          isGeneratingCommercial={studio.isGeneratingCommercial}
          onGenerateCommercial={studio.handleGenerateCommercial}
        />
      )}

      {activeTab === 'holidays' && (
        <HolidayWorkspace onLoadHolidayTemplate={studio.handleLoadHolidayTemplate} />
      )}

      {activeTab === 'trending' && (
        <TrendingView
          results={studio.gen.results}
          onSelectTrend={({ bandType, prompt: trendPrompt }) => {
            studio.handleSelectBandArchetype(bandType);
            studio.setPrompt(trendPrompt);
            studio.setIsHelperOpen(false);
            setActiveTab('bands');
          }}
          onLoadHolidayTemplate={studio.handleLoadHolidayTemplate}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {!['listen', 'library', 'creative'].includes(activeTab) && (
        <StudioGallery
          results={studio.gen.results}
          creatorHandle={studio.creatorHandle}
          encodingVideoId={studio.encodingVideoId}
          encodingProgress={studio.encodingProgress}
          isResultPlaying={studio.isResultPlaying}
          setIsResultPlaying={studio.setIsResultPlaying}
          recordingForId={studio.recordingForId}
          communityFeed={studio.communityFeed}
          toggleExpand={studio.toggleExpand}
          updateResult={studio.updateResult}
          setHandoffNotice={studio.setHandoffNotice}
          setPublishTargetResult={studio.setPublishTargetResult}
          handleDownload={studio.handleDownload}
          handlePublishToCommunity={studio.handlePublishToCommunity}
          onDownloadVideo={studio.onDownloadVideo}
          handleToggleMicRecord={studio.handleToggleMicRecord}
          praiseBadgeById={studio.praiseBadgeById}
          setPraiseBadgeById={studio.setPraiseBadgeById}
          praiseInputById={studio.praiseInputById}
          setPraiseInputById={studio.setPraiseInputById}
          handleAddPraiseOrQuestion={studio.handleAddPraiseOrQuestion}
        />
      )}
    </>
  );
};
