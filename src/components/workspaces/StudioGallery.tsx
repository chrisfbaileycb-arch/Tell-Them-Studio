import React from 'react';
import { SongResult, CommunityFeedItem, PraiseComment } from '../../../types';
import { Icons, createUniqueSongArtworkSvg, describeSongPictureTheme } from '../../../constants';
import { CONFIG } from '../../config';
import { cleanLyricsForDisplay } from '../../utils/lyricsUtils';
import { SaveCreations } from '../CreativeWorkspace';

interface StudioGalleryProps {
  results: SongResult[];
  creatorHandle: string;
  encodingVideoId: string | null;
  encodingProgress: number;
  isResultPlaying: string | null;
  setIsResultPlaying: (id: string | null) => void;
  recordingForId: string | null;
  communityFeed: CommunityFeedItem[];
  toggleExpand: (id: string) => void;
  updateResult: (id: string, updater: (r: SongResult) => SongResult) => void;
  setHandoffNotice: (notice: string | null) => void;
  setPublishTargetResult: (r: SongResult) => void;
  handleDownload: (r: SongResult) => void;
  handlePublishToCommunity: (r: SongResult) => void;
  onDownloadVideo: (r: SongResult, includeLyrics: boolean) => void;
  handleToggleMicRecord: (id: string) => void;
  praiseBadgeById: Record<string, PraiseComment['badge']>;
  setPraiseBadgeById: React.Dispatch<React.SetStateAction<Record<string, PraiseComment['badge']>>>;
  praiseInputById: Record<string, string>;
  setPraiseInputById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleAddPraiseOrQuestion: (id: string) => void;
}

export const StudioGallery: React.FC<StudioGalleryProps> = ({
  results,
  creatorHandle,
  encodingVideoId,
  encodingProgress,
  isResultPlaying,
  setIsResultPlaying,
  recordingForId,
  communityFeed,
  toggleExpand,
  updateResult,
  setHandoffNotice,
  setPublishTargetResult,
  handleDownload,
  handlePublishToCommunity,
  onDownloadVideo,
  handleToggleMicRecord,
  praiseBadgeById,
  setPraiseBadgeById,
  praiseInputById,
  setPraiseInputById,
  handleAddPraiseOrQuestion,
}) => {
  return (
    <>
      <SaveCreations results={results} owner={creatorHandle} />
      {results.length > 0 && (
        <div className="relative mb-8 flex items-center justify-between border-b border-gray-200/80 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">
              Your studio sessions
            </h2>
            <p className="text-xs text-gray-500">
              Review your audio and lyrics here, then save to My Library or export. Duration labels are targets. Feedback and upload checklists are local session previews.
            </p>
          </div>
          <span className="text-xs font-mono text-gray-500 tabular-nums">
            {results.length} Studio Items
          </span>
        </div>
      )}

      <div className="space-y-6">
        {results.map((result) => {
          const isExpanded = result.isExpanded;
          const isEncoding = encodingVideoId === result.id;
          const isGenerating = result.status === 'generating';
          const isFailed = result.status === 'error';
          const isRecordingThis = recordingForId === result.id;
          const postGenre =
            result.bandType === 'Custom Genre' && result.customGenreName
              ? result.customGenreName
              : result.bandType;
          const postMotif =
            result.itemType === 'podcast'
              ? 'podcast'
              : result.itemType === 'commercial'
              ? 'commercial'
              : 'band';
          const postPictureUrl =
            result.coverImageUrl ||
            createUniqueSongArtworkSvg({
              title: result.title || 'Original Studio Track',
              genre: postGenre,
              prompt: result.originalPrompt || result.fullPrompt || '',
              lyrics: result.lyrics,
              creatorHandle: result.creatorHandle,
              seed: result.id,
              motif: postMotif,
            });
          const pictureThemeLabel = describeSongPictureTheme({
            title: result.title,
            genre: postGenre,
            prompt: result.originalPrompt || result.fullPrompt || '',
            lyrics: result.lyrics,
            creatorHandle: result.creatorHandle,
            seed: result.id,
            motif: postMotif,
          }).trim();

          return (
            <div
              key={result.id}
              data-testid={`studio-song-post-${result.id}`}
              className="group relative transition-all duration-300 bg-white border border-gray-200/80 card-shadow rounded-[36px] overflow-hidden"
            >
              <div className={isExpanded ? 'p-8' : 'p-5'}>
                {/* Header Row */}
                <div
                  className={`flex gap-6 items-center ${
                    isExpanded ? 'flex-col md:flex-row mb-6' : 'flex-col sm:flex-row'
                  }`}
                  onClick={() => !isExpanded && toggleExpand(result.id)}
                  style={{ cursor: isExpanded ? 'default' : 'pointer' }}
                >
                  {/* Cover Art + Play Trigger */}
                  <div
                    className={`relative shrink-0 rounded-3xl overflow-hidden shadow-md border border-gray-200 ${
                      isExpanded ? 'w-44 h-44 md:w-52 md:h-52' : 'w-20 h-20'
                    }`}
                  >
                    <img
                      data-testid="song-post-picture"
                      src={postPictureUrl}
                      alt={`Picture coinciding with ${result.title || 'Studio Song'}: ${pictureThemeLabel}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isEncoding && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                        <Icons.Loading className="w-8 h-8 text-blue-600 animate-spin" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isGenerating) return;
                        const audio = document.getElementById(
                          `audio-${result.id}`
                        ) as HTMLAudioElement | null;
                        if (audio) {
                          audio.paused ? audio.play() : audio.pause();
                        }
                      }}
                      disabled={(!result.audioUrl && !isGenerating) || isEncoding}
                      className="absolute inset-0 flex items-center justify-center text-white bg-black/20 hover:bg-black/30 transition-colors"
                    >
                      <div
                        className={`music-gradient rounded-full flex items-center justify-center border border-white/50 shadow-lg ${
                          isExpanded ? 'w-14 h-14' : 'w-10 h-10'
                        }`}
                      >
                        {isGenerating ? (
                          <Icons.Loading className="w-6 h-6 animate-spin" />
                        ) : isResultPlaying === result.id ? (
                          <Icons.Pause className="w-6 h-6" />
                        ) : (
                          <Icons.Play className="w-6 h-6 ml-0.5" />
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Title, Unboxed Metadata & Controls */}
                  <div className="flex-1 min-w-0 w-full">
                    {/* Clean unboxed metadata line with typographic separators */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-mono font-semibold text-blue-600">
                        {result.creatorHandle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-gray-800">
                        {postGenre}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{result.vocalArrangement}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-semibold text-gray-900">
                        {result.maxCapLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        data-testid="song-post-picture-theme"
                        className="font-semibold text-purple-700"
                      >
                        Post Picture: {pictureThemeLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-emerald-700">
                        Identifier: {result.originType}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h3
                        className={`font-extrabold text-gray-900 tracking-tight truncate ${
                          isExpanded ? 'text-2xl md:text-3xl' : 'text-lg'
                        }`}
                      >
                        {isFailed
                          ? 'Synthesis Interrupted'
                          : result.title ||
                            (isGenerating ? 'Synthesizing Studio Master...' : 'Untitled Track')}
                      </h3>

                      <div
                        className="flex flex-wrap items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            updateResult(result.id, (r) => ({
                              ...r,
                              thumbsUp: r.thumbsUp + 1,
                            }))
                          }
                          className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 flex items-center gap-1.5 font-mono tabular-nums"
                        >
                          <Icons.ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                          <span>{result.thumbsUp}</span>
                        </button>

                        <button
                          onClick={() => {
                            setHandoffNotice(null);
                            setPublishTargetResult(result);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Icons.Share className="w-3.5 h-3.5" />
                          <span>Handoff Link (Top 10 Platforms)</span>
                        </button>

                        <button
                          onClick={() => toggleExpand(result.id)}
                          className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-gray-900"
                          aria-label="Toggle details"
                        >
                          <Icons.ChevronRight
                            className={`w-5 h-5 transition-transform ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {result.publishedPlatforms.length > 0 && (
                      <div className="mt-1.5 text-xs text-gray-500">
                        Uploads noted by you (unverified, this session):{' '}
                        <span className="font-semibold text-gray-800">
                          {result.publishedPlatforms.join(' · ')}
                        </span>
                      </div>
                    )}

                    {/* Audio Player & Action Bar when expanded */}
                    {isExpanded && result.audioUrl && (
                      <div
                        className="mt-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <audio
                          id={`audio-${result.id}`}
                          onPlay={() => setIsResultPlaying(result.id)}
                          onPause={() => setIsResultPlaying(null)}
                          onTimeUpdate={(e) => {
                            // Enforce hard cutoff on songs
                            if (
                              result.itemType !== 'podcast' &&
                              e.currentTarget.currentTime > CONFIG.MAX_SONG_DURATION_SECONDS
                            ) {
                              e.currentTarget.pause();
                              e.currentTarget.currentTime = 0;
                            }
                          }}
                          controls
                          className="h-10 w-full rounded-xl"
                        >
                          <source src={result.audioUrl} />
                        </audio>

                        {/* Optional Recorded Human Vocal Track Playback */}
                        {result.humanVocalUrl && (
                          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-emerald-950">
                              <strong>Your Live Vocal Stem ({creatorHandle}):</strong> Layered with the band!
                            </div>
                            <audio
                              controls
                              src={result.humanVocalUrl}
                              className="h-8 w-full sm:w-64"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => handleDownload(result)}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
                          >
                            <Icons.Download className="w-4 h-4" />
                            <span>Download Master WAV</span>
                          </button>

                          {result.itemType !== 'commercial' && (
                            <button
                              type="button"
                              onClick={() => handlePublishToCommunity(result)}
                              className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 border border-purple-500/60"
                            >
                              <Icons.Share className="w-4 h-4 text-purple-300" />
                              <span>
                                {communityFeed.some(
                                  (item) => item.id === result.id && !result.id.startsWith('seed-')
                                )
                                  ? 'Published to Community ✓'
                                  : 'Publish to Community'}
                              </span>
                            </button>
                          )}

                          <button
                            onClick={() => onDownloadVideo(result, false)}
                            disabled={isEncoding}
                            className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
                          >
                            <Icons.Video className="w-4 h-4 text-purple-600" />
                            <span>
                              {isEncoding
                                ? `Rendering Video ${Math.round(encodingProgress)}%`
                                : 'Export 1080p Spectrum Video'}
                            </span>
                          </button>

                          <button
                            onClick={() => onDownloadVideo(result, true)}
                            disabled={isEncoding}
                            className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
                          >
                            <Icons.Sparkles className="w-4 h-4 text-pink-600" />
                            <span>Export Lyric / Caption Video</span>
                          </button>

                          <button
                            onClick={() => handleToggleMicRecord(result.id)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 border ${
                              isRecordingThis
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <Icons.Mic className="w-4 h-4" />
                            <span>
                              {isRecordingThis
                                ? 'Stop Recording Your Voice'
                                : 'Sing / Record Your Own Voice Over Track'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Lyrics/Script, Chapters/Storyboard, and Kindness-First Creator Praise */}
                {isExpanded && (
                  <div className="pt-6 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Lyrics, Podcast Script, or Commercial Storyboard */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-700">
                          {result.itemType === 'podcast'
                            ? 'Multi-Host Podcast Transcript & Show Chapters'
                            : result.itemType === 'commercial'
                            ? 'Commercial Copy & Visual Storyboard'
                            : 'Band Vocal Arrangement & Lyrics'}
                        </h4>
                        <span className="text-xs text-gray-500">
                          {result.metadata}
                        </span>
                      </div>

                      <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-5 max-h-60 overflow-y-auto text-sm text-gray-800 whitespace-pre-wrap leading-relaxed custom-scrollbar">
                        {result.lyrics
                          ? cleanLyricsForDisplay(result.lyrics)
                          : isGenerating
                          ? 'Synthesizing arrangement...'
                          : 'Instrumental Backing Band (Ready for Your Live Vocals)'}
                      </div>

                      {result.podcastChapters && result.podcastChapters.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-xs font-bold text-gray-700">
                            Episode Chapters ({result.podcastSchedule?.dayOfWeek} Schedule)
                          </h5>
                          {result.podcastChapters.map((ch, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-gray-50 border border-gray-200/60 text-xs flex items-start gap-3"
                            >
                              <span className="font-mono font-bold text-blue-600 tabular-nums">
                                {ch.timestamp}
                              </span>
                              <div>
                                <div className="font-bold text-gray-900">{ch.title}</div>
                                <div className="text-gray-600">{ch.summary}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {result.commercialMeta?.storyboard &&
                        result.commercialMeta.storyboard.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-gray-700">
                              Broadcast Storyboard Frames
                            </h5>
                            {result.commercialMeta.storyboard.map((fr, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-gray-50 border border-gray-200/60 text-xs space-y-1"
                              >
                                <div className="font-mono font-bold text-emerald-700">
                                  {fr.timeRange}
                                </div>
                                <div className="text-gray-900">
                                  <strong>Visual:</strong> {fr.visual}
                                </div>
                                <div className="text-gray-600">
                                  <strong>Audio Cue:</strong> {fr.audioCue}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>

                    {/* Right Column: Kindness-First Creator Praise, Questions & Handle Interactions */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-700">
                          Creator Praise, Questions & Studio Input (Handles Only)
                        </h4>
                        <span className="text-xs text-gray-500">
                          100% Respectful & Supportive
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={praiseBadgeById[result.id] || 'Great Harmony'}
                          onChange={(e) =>
                            setPraiseBadgeById((prev) => ({
                              ...prev,
                              [result.id]: e.target.value as PraiseComment['badge'],
                            }))
                          }
                          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700"
                        >
                          <option value="Great Harmony">Praise: Great Harmony</option>
                          <option value="Catchy Hook">Praise: Catchy Hook</option>
                          <option value="Radio Ready">Praise: Radio Ready</option>
                          <option value="Love Your Voice">Praise: Love Your Voice</option>
                          <option value="Clever Ad Craft">Praise: Clever Ad Craft</option>
                          <option value="Question for Creator">Ask a Studio Question</option>
                        </select>
                        <input
                          type="text"
                          value={praiseInputById[result.id] || ''}
                          onChange={(e) =>
                            setPraiseInputById((prev) => ({
                              ...prev,
                              [result.id]: e.target.value,
                            }))
                          }
                          placeholder={`Encourage ${result.creatorHandle} or ask about their track...`}
                          className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                        />
                        <button
                          onClick={() => handleAddPraiseOrQuestion(result.id)}
                          className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          Send Praise
                        </button>
                      </div>

                      <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                        {result.praiseList.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-gray-50 text-xs text-gray-500 text-center">
                            Be the first to share positive studio encouragement or ask {result.creatorHandle} a question!
                          </div>
                        ) : (
                          result.praiseList.map((p) => (
                            <div
                              key={p.id}
                              className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/60 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between text-gray-500">
                                <div>
                                  <span className="font-mono font-bold text-blue-600">
                                    {p.handle}
                                  </span>
                                  <span className="mx-1.5" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="font-semibold text-gray-900">
                                    {p.badge}
                                  </span>
                                </div>
                                <span className="font-mono tabular-nums">{p.timestamp}</span>
                              </div>
                              <p className="text-gray-700 leading-relaxed">{p.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
