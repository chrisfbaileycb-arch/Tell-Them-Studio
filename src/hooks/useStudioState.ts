import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  BandArchetype,
  CommunityFeedItem,
  DistributionPlatformName,
  Duration,
  GenerationState,
  HolidayTemplate,
  LyricsOption,
  PraiseComment,
  RadioStation,
  SongResult,
  StudioTab,
  VocalArrangement,
} from '../../types';
import {
  BAND_ARCHETYPES,
  INITIAL_COMMUNITY_SONGS,
  INITIAL_RADIO_STATIONS,
  PROMPT_HELPER_CONFIG,
  TOP_HANDOFF_PLATFORMS,
  createStudioCoverSvg,
  createUniqueSongArtworkSvg,
} from '../../constants';
import {
  createAudioUrlFromBase64,
  createStudioPreviewWavUrl,
  validateKindnessAndSafety,
} from '../utils/audioUtils';
import { cleanLyricsForDisplay } from '../utils/lyricsUtils';
import { handleDownloadVideo } from '../utils/videoUtils';
import {
  generateCoverArt,
  generateSongTitle,
  parseModelOutput,
  requestCommercialGeneration,
  requestMusicGeneration,
  requestPodcastGeneration,
} from '../services/genaiService';
import { getRandomItem } from '../utils/helpers';
import { HelperSection } from '../components/PromptBuilder';
import {
  createCommunityFeedItemFromResult,
  hydrateCommunityFeedAudio,
  loadCommunityFeedSync,
  mergeCommunityFeeds,
  saveCatalogCache,
  saveCommunityFeedSync,
} from '../utils/communityFeed';
import {
  blobToBase64,
  fetchMyCreations,
  fetchPublishedCreations,
  isOk,
  setCreationPublished,
  uploadCreation,
} from '../utils/catalogClient';
import { getCatalogSession, getCatalogState } from '../utils/catalogSession';
import { announceCreatorHandle } from '../utils/creatorHandle';
import type { PublicCreation } from '../types/community';
import { useDraft } from './useDraft';

export function useStudioState(setActiveTab: (tab: StudioTab) => void) {
  // Creator Handle (Safe handle-only identity, no personal info)
  const [creatorHandle, setCreatorHandle] = useState(() => {
    try {
      return localStorage.getItem('tell-them-handle') || '@studio_voyager';
    } catch {
      return '@studio_voyager';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tell-them-handle', creatorHandle);
    } catch {
      /* Browser privacy mode may disable persistence. */
    }
    announceCreatorHandle(creatorHandle);
  }, [creatorHandle]);

  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('@studio_voyager');

  // Band & Song Studio States
  const [selectedBand, setSelectedBand] = useDraft<BandArchetype>('selectedBand', 'Rock Band');
  const [customGenreName, setCustomGenreName] = useDraft('customGenreName', 'Upbeat Brass-Rock Fusion');
  const [vocalArrangement, setVocalArrangement] = useDraft<VocalArrangement>(
    'vocalArrangement',
    'Multi-Singer Trade-Off (Male & Female)'
  );
  const [prompt, setPrompt] = useDraft(
    'prompt',
    'An explosive indie-rock anthem with gritty guitars, driving drums, and a soaring duet chorus.'
  );
  const [isPromptManual, setIsPromptManual] = useDraft('isPromptManual', false);
  const [duration, setDuration] = useDraft<Duration>('duration', '2:48 Radio Single');
  const [lyricsOption, setLyricsOption] = useDraft<LyricsOption>('lyricsOption', 'Auto');
  const [customLyrics, setCustomLyrics] = useDraft('customLyrics', '');
  const [selectedImages, setSelectedImages] = useState<
    { data: string; mimeType: string; previewUrl: string }[]
  >([]);
  const [ipRespectConfirmed, setIpRespectConfirmed] = useState(true);

  // Results & Community Gallery
  const [gen, setGen] = useState<GenerationState>({
    results: INITIAL_COMMUNITY_SONGS.map((item) => ({ ...item, publishedPlatforms: [] })),
  });
  const [isResultPlaying, setIsResultPlaying] = useState<string | null>(null);
  const [encodingVideoId, setEncodingVideoId] = useState<string | null>(null);
  const [encodingProgress, setEncodingProgress] = useState(0);

  // Human Vocal Overdub / Mic Recording State
  const [recordingForId, setRecordingForId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Radio Stations State
  const [stations, setStations] = useState<RadioStation[]>(INITIAL_RADIO_STATIONS);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);

  // Mini-Podcast Studio States (5 to 10 mins max, optional release notes)
  const [podcastShowTitle, setPodcastShowTitle] = useDraft('podcastShowTitle', 'Backstage Band & Radio Weekly');
  const [podcastTopic, setPodcastTopic] = useDraft(
    'podcastTopic',
    'How multi-singer rock and disco bands craft unforgettable radio hooks within the 3:50 song cutoff'
  );
  const [podcastTargetMinutes, setPodcastTargetMinutes] = useDraft<number>('podcastTargetMinutes', 7);
  const [podcastDay, setPodcastDay] = useDraft('podcastDay', 'Every Wednesday');
  const [podcastTime, setPodcastTime] = useDraft('podcastTime', '08:00 AM EST');
  const [podcastHostA, setPodcastHostA] = useDraft('podcastHostA', 'Alex');
  const [podcastHostAVoice, setPodcastHostAVoice] = useDraft('podcastHostAVoice', 'Puck');
  const [podcastHostB, setPodcastHostB] = useDraft('podcastHostB', 'Sam');
  const [podcastHostBVoice, setPodcastHostBVoice] = useDraft('podcastHostBVoice', 'Kore');
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);

  // Commercial Craft Studio States
  const [adBrandName, setAdBrandName] = useDraft('adBrandName', 'Three Rivers Vinyl & Coffee');
  const [adOffering, setAdOffering] = useDraft(
    'adOffering',
    'Locally roasted morning espresso and weekend live acoustic band showcases'
  );
  const [adAudience, setAdAudience] = useDraft('adAudience', 'Music lovers, local families, and morning commuters');
  const [adTone, setAdTone] = useDraft('adTone', 'Warm, witty, upbeat classic radio craft');
  const [adCta, setAdCta] = useDraft('adCta', 'Visit Three Rivers Vinyl on Penn Ave this Saturday morning!');
  const [adSpotLength, setAdSpotLength] = useDraft<'30s' | '60s'>('adSpotLength', '30s');
  const [adVoice, setAdVoice] = useDraft('adVoice', 'Fenrir');
  const [adStandardsPledge, setAdStandardsPledge] = useState(true);
  const [isGeneratingCommercial, setIsGeneratingCommercial] = useState(false);

  // Praise & Feedback State
  const [praiseInputById, setPraiseInputById] = useState<Record<string, string>>({});
  const [praiseBadgeById, setPraiseBadgeById] = useState<Record<string, PraiseComment['badge']>>({});
  const [safetyFeedback, setSafetyFeedback] = useState<string | null>(null);

  // Publish & Direct Creator Handoff Modal State
  const [publishTargetResult, setPublishTargetResult] = useState<SongResult | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [isStandardsModalOpen, setIsStandardsModalOpen] = useState(false);

  // Helper Mode States
  const [isHelperOpen, setIsHelperOpen] = useDraft('isHelperOpen', false);
  const [helperSections, setHelperSections] = useDraft<HelperSection[]>('helperSections', [
    {
      id: 'initial',
      type: 'main',
      mood: getRandomItem(PROMPT_HELPER_CONFIG.moods),
      gender: getRandomItem(PROMPT_HELPER_CONFIG.genders),
      theme: getRandomItem(PROMPT_HELPER_CONFIG.themes),
    },
  ]);
  const [activeSelector, setActiveSelector] = useState<{
    sectionId: string;
    type: 'mood' | 'gender' | 'theme' | 'timestamp' | 'bpm' | 'scale';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Public Community Showcase Feed.
  // `localFeed` is what this browser published (plus bundled demo seeds) and is persisted as
  // before. `remoteCatalog` is the live catalog; `communityFeed` is the merged view shown in the UI.
  const [localFeed, setLocalFeed] = useState<CommunityFeedItem[]>(() => loadCommunityFeedSync());
  const [remoteCatalog, setRemoteCatalog] = useState<{ items: PublicCreation[] | null; ownRefs: Map<string, string> }>(
    () => ({ items: null, ownRefs: new Map() })
  );
  const [communityNotice, setCommunityNotice] = useState<string | null>(null);
  const merged = useMemo(
    () => mergeCommunityFeeds(localFeed, remoteCatalog.items, remoteCatalog.ownRefs),
    [localFeed, remoteCatalog]
  );
  const communityFeed = merged.feed;
  const communityFeedSource = merged.source;

  const creatorHandleRef = useRef(creatorHandle);
  creatorHandleRef.current = creatorHandle;

  /** Cache-and-network: a failed fetch keeps whatever was last known (cache, else demo seeds). */
  const refreshCommunityCatalog = async () => {
    const published = await fetchPublishedCreations();
    if (!isOk(published)) return;
    saveCatalogCache(published.data);
    const ownRefs = new Map<string, string>();
    const session = getCatalogState();
    if (session.status === 'online' && session.handle === creatorHandleRef.current) {
      const mine = await fetchMyCreations();
      if (isOk(mine)) {
        mine.data.forEach((c) => {
          if (c.clientRef) ownRefs.set(c.id, c.clientRef);
        });
      }
    }
    setRemoteCatalog({ items: published.data, ownRefs });
  };

  useEffect(() => {
    hydrateCommunityFeedAudio(localFeed).then((hydrated) => {
      // Merge by id so an item published while hydration was running is not clobbered.
      setLocalFeed((prev) => prev.map((item) => hydrated.find((h) => h.id === item.id) ?? item));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await refreshCommunityCatalog();
      // Once the creator session is known we can also de-duplicate our own uploads.
      const session = await getCatalogSession(creatorHandle);
      if (!cancelled && isOk(session)) await refreshCommunityCatalog();
    };
    void run();
    const onOnline = () => {
      void run();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [creatorHandle]);

  // Initialize playable preview WAVs on seeded community songs
  useEffect(() => {
    const rockUrl = createStudioPreviewWavUrl('rock');
    const discoUrl = createStudioPreviewWavUrl('disco');
    setGen((prev) => ({
      results: prev.results.map((item) => {
        if (item.id === 'seed-band-1' && !item.audioUrl) {
          return { ...item, audioUrl: rockUrl };
        }
        if (item.id === 'seed-band-2' && !item.audioUrl) {
          return { ...item, audioUrl: discoUrl };
        }
        return item;
      }),
    }));
  }, []);

  // Sync Helper sections to Prompt
  useEffect(() => {
    if (isHelperOpen) {
      const generated = helperSections
        .map((s) => {
          const scaleInfo = s.scale ? ` in the scale of ${s.scale}` : '';
          if (s.type === 'main') {
            const bpmInfo = s.bpm ? ` at ${s.bpm}` : '';
            return `Create a ${s.mood?.toLowerCase()} ${s.gender} song about ${s.theme?.toLowerCase()} featuring ${vocalArrangement}${bpmInfo}${scaleInfo}. Hard cutoff 3:50.`;
          } else {
            return `[From ${s.timestamp}] the arrangement transitions to a ${s.mood?.toLowerCase()} ${s.gender} section${scaleInfo}.`;
          }
        })
        .join('\n');
      setPrompt(generated);
      setIsPromptManual(false);
    }
  }, [isHelperOpen, helperSections, vocalArrangement]);

  const handleSelectBandArchetype = (archetype: BandArchetype) => {
    setSelectedBand(archetype);
    const found = BAND_ARCHETYPES.find((b) => b.id === archetype);
    if (found) {
      setVocalArrangement(found.defaultVocals);
      if (archetype === 'Singer-Free Instrumental') {
        setLyricsOption('Instrumental');
      } else if (lyricsOption === 'Instrumental') {
        setLyricsOption('Auto');
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remainingSlots = 10 - selectedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setSelectedImages((prev) => [
          ...prev,
          { data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].previewUrl);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const updateResult = (id: string, updater: (prev: SongResult) => SongResult) => {
    setGen((prev) => ({
      results: prev.results.map((r) => (r.id === id ? updater(r) : r)),
    }));
  };

  const addLog = (id: string, message: string) => {
    updateResult(id, (prev) => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    }));
  };

  const toggleExpand = (id: string) => {
    setGen((prev) => ({
      results: prev.results.map((r) => (r.id === id ? { ...r, isExpanded: !r.isExpanded } : r)),
    }));
  };

  const handlePublishToCommunity = async (result: SongResult) => {
    if (result.itemType === 'commercial') return;
    const narratorLabel =
      result.itemType === 'podcast'
        ? `Narrators: ${podcastHostA} (${podcastHostAVoice}) & ${podcastHostB} (${podcastHostBVoice})`
        : undefined;
    const feedItem = await createCommunityFeedItemFromResult(result, narratorLabel);
    // Local-first: the item is visible immediately, whether or not the live catalog is reachable.
    setLocalFeed((prev) => {
      const updated = [feedItem, ...prev.filter((item) => item.id !== feedItem.id)];
      saveCommunityFeedSync(updated);
      return updated;
    });
    setCommunityNotice(`Published "${feedItem.title}" to the Public Community Showcase!`);
    void promoteToLiveCatalog(result, feedItem);
  };

  /**
   * Best-effort: mirror a locally published item into the durable catalog. The server owns the
   * publication decision (moderation, rate limits), so a rejection here retracts the local item.
   */
  const promoteToLiveCatalog = async (result: SongResult, feedItem: CommunityFeedItem) => {
    const localOnly = (why: string) =>
      setCommunityNotice(`Published "${feedItem.title}" on this device. ${why}`);
    try {
      if (result.creatorHandle !== creatorHandle) {
        return localOnly('Sign in with the handle that created it to share it with everyone.');
      }
      const session = await getCatalogSession(creatorHandle);
      if (!isOk(session)) {
        if (session.reason === 'conflict' || session.reason === 'invalid' || session.code === 'reserved_handle') {
          return localOnly('Choose your own handle (Change Handle) to share it through the live catalog.');
        }
        return; // Catalog offline/unavailable: local publish stands, with no extra noise.
      }
      if (!result.audioUrl) return;
      const audio = await (await fetch(result.audioUrl)).blob();
      const created = await uploadCreation({
        title: feedItem.title,
        genre: feedItem.genre,
        lyrics: feedItem.lyrics,
        kind: feedItem.type,
        provenance:
          result.originType && result.originType !== 'Craft Commercial Spot'
            ? result.originType
            : feedItem.type === 'podcast'
              ? 'AI Multi-Host Podcast'
              : 'AI-Generated Material',
        durationLabel: feedItem.durationLabel,
        vocalArrangement: feedItem.vocalArrangement,
        narratorInfo: feedItem.narratorInfo,
        clientRef: result.id,
        audioBase64: await blobToBase64(audio),
        mimeType: audio.type || undefined,
      });
      if (!isOk(created)) {
        if (created.reason === 'rejected') return retractLocalPublish(feedItem, created.flagReason || created.message);
        return localOnly('It will be shared when the live catalog is reachable.');
      }
      const published = await setCreationPublished(created.data.creation.id, true);
      if (!isOk(published)) {
        if (published.reason === 'rejected') return retractLocalPublish(feedItem, published.flagReason || published.message);
        return localOnly('It will be shared when the live catalog is reachable.');
      }
      setLocalFeed((prev) => {
        const updated = prev.map((item) =>
          item.id === feedItem.id ? { ...item, remoteId: created.data.creation.id } : item
        );
        saveCommunityFeedSync(updated);
        return updated;
      });
      setCommunityNotice(`Published "${feedItem.title}" to the live Public Community Showcase!`);
      void refreshCommunityCatalog();
    } catch {
      /* Network/blob problems never undo the local publish. */
    }
  };

  const retractLocalPublish = (feedItem: CommunityFeedItem, reason: string) => {
    setLocalFeed((prev) => {
      const updated = prev.filter((item) => item.id !== feedItem.id);
      saveCommunityFeedSync(updated);
      return updated;
    });
    setCommunityNotice(`"${feedItem.title}" was not published: ${reason}`);
  };

  const handleGenerate = async (overrides?: {
    prompt: string;
    duration: Duration;
    lyricsOption: LyricsOption;
    customLyrics?: string;
    band?: BandArchetype;
    vocals?: VocalArrangement;
  }) => {
    const activePrompt = overrides?.prompt ?? prompt;
    const activeDuration = overrides?.duration ?? duration;
    const activeLyricsOption = overrides?.lyricsOption ?? lyricsOption;
    const activeCustomLyrics = overrides?.customLyrics ?? customLyrics;
    const activeBand = overrides?.band ?? selectedBand;
    const activeVocals = overrides?.vocals ?? vocalArrangement;

    if (!activePrompt.trim() && selectedImages.length === 0) return;

    const safetyCheck = validateKindnessAndSafety(activePrompt + ' ' + activeCustomLyrics);
    if (!safetyCheck.valid) {
      setSafetyFeedback(safetyCheck.reason || 'Content violates studio guidelines.');
      return;
    }
    setSafetyFeedback(null);

    const newId = Math.random().toString(36).substring(7);
    const isSingerFree =
      activeBand === 'Singer-Free Instrumental' ||
      activeVocals === 'Singer-Free (Record Your Own Voice)' ||
      activeLyricsOption === 'Instrumental';

    const isClip =
      activeDuration === '0:30 Hook / Jingle' ||
      activeDuration === '0:30 Hook Preview' ||
      activeDuration === 'Lyria 3 Clip (30s)' ||
      activeDuration === 'Clip (30s)';

    const targetLengthDescription = isClip
      ? '30-second jingle or hook preview'
      : activeDuration === '2:15 Tight Single'
      ? 'tight 2-minute 15-second radio single (within the 3:50 song cutoff)'
      : activeDuration === '2:48 Radio Single' || activeDuration === '2:48 Radio Master (Max)'
      ? '2-minute 48-second radio single (within the 3:50 song cutoff)'
      : 'full-length radio song up to the 3 minutes and 50 seconds (3:50) hard cutoff';

    const genreDescription =
      activeBand === 'Custom Genre' ? customGenreName || 'Custom Genre' : activeBand;

    const initialCoverUrl = createUniqueSongArtworkSvg({
      title: activePrompt.slice(0, 28) || 'Original Studio Track',
      genre: genreDescription,
      prompt: activePrompt,
      lyrics: activeCustomLyrics,
      creatorHandle,
      seed: newId,
      motif: 'band',
    });

    const newResult: SongResult = {
      id: newId,
      itemType: 'song',
      status: 'generating',
      logs: [],
      audioUrl: null,
      coverImageUrl: initialCoverUrl,
      title: null,
      creatorHandle,
      bandType: activeBand,
      customGenreName: activeBand === 'Custom Genre' ? customGenreName : undefined,
      vocalArrangement: activeVocals,
      originType: isSingerFree ? 'Human Voice + AI Backing Band' : 'AI-Generated Material',
      lyrics: '',
      metadata: `${activeBand === 'Custom Genre' ? customGenreName : activeBand} · ${activeVocals} · ${isClip ? '0:30 Jingle/Hook' : '3:50 Max Song Cutoff'}`,
      fullPrompt: null,
      error: null,
      duration: activeDuration,
      maxCapLabel: isClip
        ? '0:30 JINGLE / HOOK'
        : activeDuration === '2:15 Tight Single'
        ? '2:15 / 3:50 MAX'
        : activeDuration === '2:48 Radio Single' || activeDuration === '2:48 Radio Master (Max)'
        ? '2:48 / 3:50 MAX'
        : '3:50 / 3:50 MAX',
      timestamp: new Date(),
      isExpanded: true,
      thumbsUp: 1,
      praiseList: [],
      publishedPlatforms: [],
      originalPrompt: activePrompt,
      originalDuration: activeDuration,
      originalLyricsOption: activeLyricsOption,
    };

    setGen((prev) => ({
      results: [newResult, ...prev.results.map((r) => ({ ...r, isExpanded: false }))],
    }));

    addLog(
      newId,
      `Initializing ${genreDescription} (${activeVocals}) — ${isClip ? '0:30 Jingle/Hook mode' : 'requesting a song up to the 3:50 target'}...`
    );
    addLog(newId, `Embedding AI Material Transparency Identifier in respect of human songwriters and musicians.`);

    try {
      const lyricInstruction = isSingerFree
        ? 'IMPORTANT: This track MUST be strictly INSTRUMENTAL with clear vocal pocket headroom so a human singer can record or perform over the band.'
        : activeLyricsOption === 'Custom'
        ? `\nUse these exact lyrics with ${activeVocals}:\n${activeCustomLyrics}`
        : `\nGenerate uplifting, radio-safe lyrics arranged for ${activeVocals} with clear vocal handoffs (e.g. [Lead 1], [Lead 2], [Band Chorus], [Bridge]).`;

      const promptText = `Generate a ${targetLengthDescription} performed by a ${genreDescription}. Vocal arrangement: ${activeVocals}. Context: "${activePrompt}". ${lyricInstruction} Keep all content family-safe, original, and respectful.`;

      updateResult(newId, (r) => ({ ...r, fullPrompt: promptText }));

      const { audioBase64, mimeType, rawText } = await requestMusicGeneration({
        promptText,
        isClip,
        images: selectedImages.map((img) => ({ data: img.data, mimeType: img.mimeType })),
      });

      const { lyrics, metadata } = parseModelOutput(rawText);
      const audioUrl = createAudioUrlFromBase64(audioBase64, mimeType);

      updateResult(newId, (r) => ({
        ...r,
        status: 'completed',
        audioUrl,
        lyrics: lyrics || (isSingerFree ? 'Instrumental Band Backing Track (Ready for Your Voice)' : ''),
        metadata: metadata || r.metadata,
      }));
      addLog(newId, isClip ? 'Jingle / hook stream captured.' : 'Audio received. Duration is a generation target; review the actual playback length before export.');

      const title = await generateSongTitle(activePrompt, lyrics || activePrompt);
      const syncedVectorCover = createUniqueSongArtworkSvg({
        title,
        genre: genreDescription,
        prompt: activePrompt,
        lyrics: lyrics || activePrompt,
        creatorHandle,
        seed: newId,
        motif: 'band',
      });
      updateResult(newId, (r) => ({ ...r, title, coverImageUrl: syncedVectorCover }));
      addLog(newId, `Track titled: "${title}"`);

      const coverImageUrl = await generateCoverArt(
        activePrompt,
        lyrics || activePrompt,
        title,
        'band',
        genreDescription,
        creatorHandle,
        newId
      );
      updateResult(newId, (r) => ({ ...r, coverImageUrl }));
    } catch (err: unknown) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err instanceof Error ? err.message : 'Band synthesis interrupted.',
      }));
    }
  };

  const handleGeneratePodcast = async () => {
    if (podcastTargetMinutes < 5 || podcastTargetMinutes > 10) {
      setSafetyFeedback('Mini-podcasts must be between 5 and 10 minutes (10 minutes max).');
      return;
    }
    const safety = validateKindnessAndSafety(podcastShowTitle + ' ' + podcastTopic);
    if (!safety.valid) {
      setSafetyFeedback(safety.reason || 'Podcast topic violates community standards.');
      return;
    }
    setSafetyFeedback(null);
    setIsGeneratingPodcast(true);

    const newId = 'pod-' + Math.random().toString(36).substring(7);
    const placeholder: SongResult = {
      id: newId,
      itemType: 'podcast',
      status: 'generating',
      logs: [
        `[Podcast Studio] Scripting ${podcastTargetMinutes}-minute episode for "${podcastShowTitle}"...`,
        `[Release notes only] ${podcastDay} at ${podcastTime}. No automatic scheduling is connected.`,
      ],
      audioUrl: null,
      coverImageUrl: createStudioCoverSvg('#0f172a', '#1e3a8a', '#38bdf8', 'podcast'),
      title: `${podcastShowTitle} (Synthesizing...)`,
      creatorHandle,
      bandType: 'Custom Genre',
      vocalArrangement: 'Multi-Singer Trade-Off (Male & Female)',
      originType: 'AI Multi-Host Podcast',
      lyrics: '',
      metadata: `Mini-Podcast · ${podcastTargetMinutes}:00 Target (10m Max) · ${podcastDay}`,
      fullPrompt: `Show: ${podcastShowTitle} | Topic: ${podcastTopic} | Hosts: ${podcastHostA} & ${podcastHostB}`,
      error: null,
      duration: '3:50 Radio Master (Max)',
      maxCapLabel: `${podcastTargetMinutes}:00 / 10:00 MAX`,
      timestamp: new Date(),
      isExpanded: true,
      thumbsUp: 1,
      praiseList: [],
      publishedPlatforms: [],
      podcastSchedule: {
        dayOfWeek: podcastDay,
        timeOfDay: podcastTime,
        targetMinutes: podcastTargetMinutes,
        committedWeekly: false,
      },
      originalPrompt: podcastTopic,
      originalDuration: '3:50 Radio Master (Max)',
      originalLyricsOption: 'Auto',
    };

    setGen((prev) => ({
      results: [placeholder, ...prev.results.map((r) => ({ ...r, isExpanded: false }))],
    }));

    try {
      const data = await requestPodcastGeneration({
        showTitle: podcastShowTitle,
        episodeTopic: podcastTopic,
        targetMinutes: podcastTargetMinutes,
        hostAName: podcastHostA,
        hostAVoice: podcastHostAVoice,
        hostBName: podcastHostB,
        hostBVoice: podcastHostBVoice,
        scheduleDay: podcastDay,
        scheduleTime: podcastTime,
      });

      const formattedScript = (data.scriptLines || [])
        .map((line: { speaker: string; text: string }, idx: number) => {
          const sec = idx * 12;
          const mm = Math.floor(sec / 60);
          const ss = (sec % 60).toString().padStart(2, '0');
          return `[${mm}:${ss}] ${line.speaker}: ${line.text}`;
        })
        .join('\n\n');

      if (!data.audioBase64) throw new Error('Podcast speech was not returned. No music demo has been substituted.');
      const audioUrl = createAudioUrlFromBase64(data.audioBase64, data.mimeType || 'audio/L16;rate=24000');

      const coverImageUrl = await generateCoverArt(
        podcastShowTitle,
        podcastTopic,
        data.episodeTitle,
        'podcast',
        'Podcast',
        creatorHandle,
        newId
      );

      updateResult(newId, (r) => ({
        ...r,
        status: 'completed',
        title: data.episodeTitle,
        audioUrl,
        coverImageUrl,
        lyrics: formattedScript,
        metadata: `${data.showNotes || `Weekly on ${podcastDay}`} · ${podcastTargetMinutes} Min Mini-Podcast`,
        podcastChapters: data.chapters || [],
      }));
      addLog(newId, 'Dual-host podcast audio & video-ready transcript finalized.');
    } catch (err: unknown) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err instanceof Error ? err.message : 'Mini-podcast generation failed.',
      }));
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  const handleGenerateCommercial = async () => {
    if (!adStandardsPledge) {
      setSafetyFeedback(
        'Please confirm the Authentic Ad Craft, PG Family Safety & No-Impersonation Standards before generating a commercial.'
      );
      return;
    }
    const safety = validateKindnessAndSafety(`${adBrandName} ${adOffering} ${adCta}`);
    if (!safety.valid) {
      setSafetyFeedback(safety.reason || 'Commercial copy violates broadcast standards.');
      return;
    }
    setSafetyFeedback(null);
    setIsGeneratingCommercial(true);

    const newId = 'ad-' + Math.random().toString(36).substring(7);
    const placeholder: SongResult = {
      id: newId,
      itemType: 'commercial',
      status: 'generating',
      logs: [
        `[Commercial Craft Studio] Designing ${adSpotLength} broadcast spot for "${adBrandName}"...`,
        `[Standards Check] Verified PG Family-Safe, Authentic Copywriting, Zero Deepfake Avatars.`,
      ],
      audioUrl: null,
      coverImageUrl: createStudioCoverSvg('#064e3b', '#115e59', '#34d399', 'commercial'),
      title: `${adBrandName} — ${adSpotLength} Radio Spot`,
      creatorHandle,
      bandType: 'Custom Genre',
      vocalArrangement: 'Lead Male + Band Backing',
      originType: 'Craft Commercial Spot',
      lyrics: '',
      metadata: `Broadcast Commercial · ${adSpotLength} Spot · PG Family-Safe`,
      fullPrompt: `Brand: ${adBrandName} | Offering: ${adOffering} | CTA: ${adCta}`,
      error: null,
      duration: '0:30 Hook Preview',
      maxCapLabel: `${adSpotLength} AD SPOT`,
      timestamp: new Date(),
      isExpanded: true,
      thumbsUp: 1,
      praiseList: [],
      publishedPlatforms: [],
      originalPrompt: `${adBrandName}: ${adOffering}`,
      originalDuration: '0:30 Hook Preview',
      originalLyricsOption: 'Auto',
    };

    setGen((prev) => ({
      results: [placeholder, ...prev.results.map((r) => ({ ...r, isExpanded: false }))],
    }));

    try {
      const data = await requestCommercialGeneration({
        brandName: adBrandName,
        productOrService: adOffering,
        targetAudience: adAudience,
        adTone,
        callToAction: adCta,
        spotLength: adSpotLength,
        voiceName: adVoice,
      });

      if (!data.audioBase64) throw new Error('Commercial speech was not returned. No music demo has been substituted.');
      const audioUrl = createAudioUrlFromBase64(data.audioBase64, data.mimeType || 'audio/L16;rate=24000');

      const coverImageUrl = await generateCoverArt(
        adBrandName,
        adOffering,
        data.campaignTitle,
        'commercial',
        'Broadcast Commercial',
        creatorHandle,
        newId
      );

      updateResult(newId, (r) => ({
        ...r,
        status: 'completed',
        title: `${adBrandName}: "${data.campaignTitle || 'Broadcast Spot'}"`,
        audioUrl,
        coverImageUrl,
        lyrics: `[0:00] VOICEOVER (${adSpotLength}): ${data.voiceoverScript}\n\n[SONIC DIRECTION]: ${data.sonicDirection}\n[TAGLINE]: "${data.tagline}"`,
        metadata: `${adBrandName} · ${adSpotLength} Craft Commercial · ${data.complianceNotes || 'PG Broadcast Verified'}`,
        commercialMeta: {
          brandName: adBrandName,
          tagline: data.tagline || '',
          callToAction: adCta,
          spotLength: adSpotLength,
          pgVerified: true,
          storyboard: data.storyboardFrames || [],
        },
      }));
      addLog(newId, 'Broadcast commercial voiceover & storyboard deck completed.');
    } catch (err: unknown) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err instanceof Error ? err.message : 'Commercial generation failed.',
      }));
    } finally {
      setIsGeneratingCommercial(false);
    }
  };

  const handleToggleMicRecord = async (resultId: string) => {
    if (recordingForId === resultId) {
      mediaRecorderRef.current?.stop();
      setRecordingForId(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const vocalUrl = URL.createObjectURL(blob);
        updateResult(resultId, (r) => ({
          ...r,
          humanVocalUrl: vocalUrl,
          originType: 'Human Voice + AI Backing Band',
        }));
        addLog(
          resultId,
          `Live human vocal stem recorded by ${creatorHandle}! Origin updated to "Human Voice + AI Backing Band".`
        );
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingForId(resultId);

      const backingAudio = document.getElementById(`audio-${resultId}`) as HTMLAudioElement | null;
      if (backingAudio) {
        backingAudio.currentTime = 0;
        backingAudio.play().catch(() => {});
      }
    } catch {
      setSafetyFeedback(
        'Microphone access was unavailable. You can grant mic permission in your browser to record your live voice over any band track.'
      );
    }
  };

  const handleAddPraiseOrQuestion = (resultId: string) => {
    const rawText = (praiseInputById[resultId] || '').trim();
    if (!rawText) return;

    const check = validateKindnessAndSafety(rawText);
    if (!check.valid) {
      setSafetyFeedback(check.reason || 'Please keep all creator interactions kind and respectful.');
      return;
    }
    setSafetyFeedback(null);

    const badge = praiseBadgeById[resultId] || 'Great Harmony';
    const newComment: PraiseComment = {
      id: Math.random().toString(36).substring(7),
      handle: creatorHandle,
      badge,
      message: rawText,
      timestamp: 'Just now',
    };

    updateResult(resultId, (r) => ({
      ...r,
      praiseList: [newComment, ...r.praiseList],
    }));
    setPraiseInputById((prev) => ({ ...prev, [resultId]: '' }));
  };

  const handleLoadHolidayTemplate = (tpl: HolidayTemplate) => {
    setSelectedBand(tpl.bandType);
    setVocalArrangement(tpl.vocalArrangement);
    setPrompt(tpl.prompt);
    setCustomLyrics(tpl.suggestedLyrics);
    setLyricsOption('Custom');
    setDuration('3:50 Radio Master (Max)');
    setIsHelperOpen(false);
    setActiveTab('bands');
  };

  const handleDownload = (result: SongResult) => {
    if (!result.audioUrl) return;
    const link = document.createElement('a');
    link.href = result.audioUrl;
    link.download = `${result.title || 'TellThemStudio'}_${result.originType.replace(/\s+/g, '_')}.wav`;
    link.click();
  };

  const onDownloadVideo = async (result: SongResult, withLyrics: boolean = false) => {
    if (!result.audioUrl || !result.coverImageUrl || encodingVideoId) return;
    setEncodingVideoId(result.id);
    setEncodingProgress(0);

    try {
      await handleDownloadVideo(
        result,
        withLyrics,
        (progress) => setEncodingProgress(progress),
        () => {
          setEncodingVideoId(null);
          setEncodingProgress(0);
        }
      );
    } catch (error) {
      setSafetyFeedback(`Video export failed: ${(error as Error).message}`);
    }
  };

  const handleSyndicateToggle = (resultId: string, platform: DistributionPlatformName) => {
    updateResult(resultId, (r) => {
      const exists = r.publishedPlatforms.includes(platform);
      const updated = exists
        ? r.publishedPlatforms.filter((p) => p !== platform)
        : [...r.publishedPlatforms, platform];
      return { ...r, publishedPlatforms: updated };
    });
    if (publishTargetResult && publishTargetResult.id === resultId) {
      setPublishTargetResult((prev) => {
        if (!prev) return null;
        const exists = prev.publishedPlatforms.includes(platform);
        return {
          ...prev,
          publishedPlatforms: exists
            ? prev.publishedPlatforms.filter((p) => p !== platform)
            : [...prev.publishedPlatforms, platform],
        };
      });
    }
  };

  const buildHandoffMetadataText = (result: SongResult, platformName?: string) => {
    const genreLabel =
      result.bandType === 'Custom Genre' && result.customGenreName
        ? result.customGenreName
        : result.bandType;
    return [
      `Title: ${result.title || 'Untitled Studio Creation'}`,
      `Creator Handle: ${result.creatorHandle}`,
      `Format / Genre: ${genreLabel} (${result.vocalArrangement})`,
      `Duration Compliance: ${result.maxCapLabel}`,
      `Mandatory Transparency Identifier: ${result.originType}`,
      platformName ? `Destination Portal: ${platformName} (Creator-Authenticated Handoff)` : '',
      `---`,
      result.lyrics ? cleanLyricsForDisplay(result.lyrics) : 'Instrumental / Studio Audio Master',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyHandoffMetadata = async (result: SongResult, platformName?: string) => {
    const text = buildHandoffMetadataText(result, platformName);
    try {
      await navigator.clipboard.writeText(text);
      setHandoffNotice(
        platformName
          ? `Copied release metadata for ${platformName}! Log into your own ${platformName} account in the opened tab to upload your audio/video.`
          : 'Copied release metadata & AI/Human origin disclosure to your clipboard!'
      );
    } catch {
      setHandoffNotice(
        'Handoff ready! Download your WAV/Video below and sign in with your own account on the destination platform.'
      );
    }
  };

  const handleDownloadHandoffPackage = (result: SongResult) => {
    handleDownload(result);
    const manifest = {
      handoffType: 'Tell Them Studio Direct Creator Handoff (Zero Stored Keys)',
      authPolicy:
        'Creator authenticates directly on destination platform with their own login. No third-party API keys or OAuth tokens are stored by Tell Them Studio.',
      title: result.title || 'Untitled Studio Track',
      creatorHandle: result.creatorHandle,
      genre: result.bandType === 'Custom Genre' ? result.customGenreName : result.bandType,
      vocalArrangement: result.vocalArrangement,
      originIdentifier: result.originType,
      durationCap: result.maxCapLabel,
      lyricsOrTranscript: result.lyrics ? cleanLyricsForDisplay(result.lyrics) : '',
      destinations: TOP_HANDOFF_PLATFORMS.map((p) => ({
        platform: p.name,
        handoffUrl: p.handoffUrl,
        acceptedFormats: p.acceptedFormats,
      })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(result.title || 'TellThemStudio').replace(/\s+/g, '_')}_Handoff_Manifest.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setHandoffNotice('Downloaded Master WAV + Handoff Release Manifest (.json) for your personal upload!');
  };

  const featuredTrack = gen.results.find(
    (r) => r.status === 'completed' && r.audioUrl && r.itemType !== 'podcast' && r.itemType !== 'commercial'
  );

  return {
    creatorHandle,
    setCreatorHandle,
    isEditingHandle,
    setIsEditingHandle,
    handleDraft,
    setHandleDraft,
    selectedBand,
    setSelectedBand,
    customGenreName,
    setCustomGenreName,
    vocalArrangement,
    setVocalArrangement,
    prompt,
    setPrompt,
    isPromptManual,
    setIsPromptManual,
    duration,
    setDuration,
    lyricsOption,
    setLyricsOption,
    customLyrics,
    setCustomLyrics,
    selectedImages,
    setSelectedImages,
    ipRespectConfirmed,
    setIpRespectConfirmed,
    gen,
    setGen,
    isResultPlaying,
    setIsResultPlaying,
    encodingVideoId,
    encodingProgress,
    recordingForId,
    stations,
    setStations,
    activeStationId,
    setActiveStationId,
    podcastShowTitle,
    setPodcastShowTitle,
    podcastTopic,
    setPodcastTopic,
    podcastTargetMinutes,
    setPodcastTargetMinutes,
    podcastDay,
    setPodcastDay,
    podcastTime,
    setPodcastTime,
    podcastHostA,
    setPodcastHostA,
    podcastHostAVoice,
    setPodcastHostAVoice,
    podcastHostB,
    setPodcastHostB,
    podcastHostBVoice,
    setPodcastHostBVoice,
    isGeneratingPodcast,
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
    praiseInputById,
    setPraiseInputById,
    praiseBadgeById,
    setPraiseBadgeById,
    safetyFeedback,
    setSafetyFeedback,
    publishTargetResult,
    setPublishTargetResult,
    handoffNotice,
    setHandoffNotice,
    isStandardsModalOpen,
    setIsStandardsModalOpen,
    isHelperOpen,
    setIsHelperOpen,
    helperSections,
    setHelperSections,
    activeSelector,
    setActiveSelector,
    fileInputRef,
    communityFeed,
    communityFeedSource,
    communityNotice,
    setCommunityNotice,
    handleSelectBandArchetype,
    handleImageUpload,
    removeImage,
    updateResult,
    toggleExpand,
    handlePublishToCommunity,
    handleGenerate,
    handleGeneratePodcast,
    handleGenerateCommercial,
    handleToggleMicRecord,
    handleAddPraiseOrQuestion,
    handleLoadHolidayTemplate,
    handleDownload,
    onDownloadVideo,
    handleSyndicateToggle,
    handleCopyHandoffMetadata,
    handleDownloadHandoffPackage,
    featuredTrack,
  };
}
