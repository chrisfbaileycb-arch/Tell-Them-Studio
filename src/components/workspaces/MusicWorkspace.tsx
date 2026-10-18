import React from 'react';
import { BandArchetype, VocalArrangement, Duration, LyricsOption, SongResult, CommunityFeedItem } from '../../../types';
import { CONFIG } from '../../config';
import { MusicStudio } from '../MusicStudio';
import { PromptBuilder, HelperSection } from '../PromptBuilder';
import { GenreSamples } from '../CreativeWorkspace';

interface MusicWorkspaceProps {
  selectedBand: BandArchetype;
  handleSelectBandArchetype: (band: BandArchetype) => void;
  vocalArrangement: VocalArrangement;
  setVocalArrangement: (v: VocalArrangement) => void;
  prompt: string;
  setPrompt: (p: string) => void;
  setIsPromptManual: (m: boolean) => void;
  duration: Duration;
  setDuration: (d: Duration) => void;
  lyricsOption: LyricsOption;
  setLyricsOption: (l: LyricsOption) => void;
  customLyrics: string;
  setCustomLyrics: (l: string) => void;
  customGenreName: string;
  setCustomGenreName: (g: string) => void;
  selectedImages: { data: string; mimeType: string; previewUrl: string }[];
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: (index: number) => void;
  handleGenerate: () => void;
  isGenerating: boolean;
  ipRespectConfirmed: boolean;
  setIpRespectConfirmed: (c: boolean) => void;
  featuredTrack: SongResult | undefined;
  handleDownload: (r: SongResult) => void;
  handlePublishToCommunity: (r: SongResult) => void;
  isFeaturedPublished: boolean;
  isHelperOpen: boolean;
  setIsHelperOpen: (open: boolean) => void;
  helperSections: HelperSection[];
  setHelperSections: React.Dispatch<React.SetStateAction<HelperSection[]>>;
  activeSelector: { sectionId: string; type: 'mood' | 'gender' | 'theme' | 'timestamp' | 'bpm' | 'scale'; } | null;
  setActiveSelector: React.Dispatch<React.SetStateAction<{ sectionId: string; type: 'mood' | 'gender' | 'theme' | 'timestamp' | 'bpm' | 'scale'; } | null>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  creatorHandle: string;
  onNavigateTab: (tab: 'creative' | 'holidays') => void;
}

export const MusicWorkspace: React.FC<MusicWorkspaceProps> = ({
  selectedBand,
  handleSelectBandArchetype,
  vocalArrangement,
  setVocalArrangement,
  prompt,
  setPrompt,
  setIsPromptManual,
  duration,
  setDuration,
  lyricsOption,
  setLyricsOption,
  customLyrics,
  setCustomLyrics,
  customGenreName,
  setCustomGenreName,
  selectedImages,
  handleImageUpload,
  removeImage,
  handleGenerate,
  isGenerating,
  ipRespectConfirmed,
  setIpRespectConfirmed,
  featuredTrack,
  handleDownload,
  handlePublishToCommunity,
  isFeaturedPublished,
  isHelperOpen,
  setIsHelperOpen,
  helperSections,
  setHelperSections,
  activeSelector,
  setActiveSelector,
  fileInputRef,
  creatorHandle,
  onNavigateTab,
}) => {
  return (
    <>
      <MusicStudio
        genre={selectedBand}
        onGenre={handleSelectBandArchetype}
        vocals={vocalArrangement}
        onVocals={setVocalArrangement}
        brief={prompt}
        onBrief={(value) => {
          setPrompt(value);
          setIsPromptManual(true);
        }}
        duration={duration}
        onDuration={setDuration}
        lyricsMode={lyricsOption}
        onLyricsMode={setLyricsOption}
        lyrics={customLyrics}
        onLyrics={setCustomLyrics}
        customGenre={customGenreName}
        onCustomGenre={setCustomGenreName}
        images={selectedImages}
        onImages={handleImageUpload}
        onRemoveImage={removeImage}
        generate={handleGenerate}
        generating={isGenerating}
        disabled={
          (!prompt.trim() && selectedImages.length === 0) ||
          !ipRespectConfirmed ||
          CONFIG.IS_MAINTENANCE_MODE
        }
        confirmed={ipRespectConfirmed}
        onConfirmed={setIpRespectConfirmed}
        featured={featuredTrack}
        onDownloadFeatured={handleDownload}
        onPublishFeatured={handlePublishToCommunity}
        isFeaturedPublished={isFeaturedPublished}
        helperOpen={isHelperOpen}
        onHelperOpen={setIsHelperOpen}
        helper={
          <PromptBuilder
            isHelperOpen={isHelperOpen}
            helperSections={helperSections}
            setHelperSections={setHelperSections}
            activeSelector={activeSelector}
            setActiveSelector={setActiveSelector}
            selectedImages={selectedImages}
            onImageSelect={() => fileInputRef.current?.click()}
            onImageRemove={removeImage}
          />
        }
      />
      <input
        className="hidden"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
      />
      <details className="studio-inspiration">
        <summary>Explore more sounds & original sketches</summary>
        <GenreSamples
          genre={selectedBand}
          owner={creatorHandle}
          onCreate={(band, brief) => {
            handleSelectBandArchetype(band);
            setPrompt(brief);
            setIsHelperOpen(false);
          }}
        />
        <div className="cw cw-actions">
          <button onClick={() => onNavigateTab('creative')}>
            Develop lyrics or a new direction
          </button>
          <button onClick={() => onNavigateTab('holidays')}>
            Seasonal templates
          </button>
        </div>
      </details>
    </>
  );
};
