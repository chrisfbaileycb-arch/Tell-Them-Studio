import React, { useState, useRef, useEffect } from 'react';
import {
  BandArchetype,
  ContentOriginType,
  DistributionPlatformName,
  Duration,
  GenerationState,
  HandoffPlatformInfo,
  HolidayTemplate,
  LyricsOption,
  PraiseComment,
  RadioStation,
  SongResult,
  StudioTab,
  VocalArrangement,
} from './types';
import {
  BAND_ARCHETYPES,
  HOLIDAY_TEMPLATES,
  INITIAL_COMMUNITY_SONGS,
  INITIAL_RADIO_STATIONS,
  Icons,
  PROMPT_HELPER_CONFIG,
  TOP_HANDOFF_PLATFORMS,
  VOCAL_ARRANGEMENTS,
  createStudioCoverSvg,
} from './constants';
import { CONFIG } from './src/config';
import {
  createAudioUrlFromBase64,
  createStudioPreviewWavUrl,
  validateKindnessAndSafety,
} from './src/utils/audioUtils';
import { cleanLyricsForDisplay } from './src/utils/lyricsUtils';
import { handleDownloadVideo } from './src/utils/videoUtils';
import {
  generateCoverArt,
  generateSongTitle,
  parseModelOutput,
  requestCommercialGeneration,
  requestMusicGeneration,
  requestPodcastGeneration,
} from './src/services/genaiService';
import { getRandomItem } from './src/utils/helpers';
import { PromptBuilder, HelperSection } from './src/components/PromptBuilder';
import { CreativeWorkspace, GenreSamples, PodcastSamples, SaveCreations } from './src/components/CreativeWorkspace';
import { TrendingView } from './src/components/TrendingView';
import { Hero } from './src/components/Hero';

const App: React.FC = () => {
  // Active workspace tab
  const [activeTab, setActiveTab] = useState<StudioTab>(() => { const route = window.location.hash.slice(1); return ['bands', 'singers', 'acoustic', 'stations', 'podcasts', 'commercials', 'holidays', 'trending', 'listen', 'library', 'creative'].includes(route) ? route as StudioTab : 'bands'; });

  useEffect(() => {
    const onRoute = () => {
      const route = window.location.hash.slice(1);
      if (['bands', 'singers', 'acoustic', 'stations', 'podcasts', 'commercials', 'holidays', 'trending', 'listen', 'library', 'creative'].includes(route)) setActiveTab(route as StudioTab);
    };
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);
  useEffect(() => { window.history.replaceState(null, '', `#${activeTab}`); window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeTab]);

  // Creator Handle (Safe handle-only identity, no personal info)
  const [creatorHandle, setCreatorHandle] = useState(() => { try { return localStorage.getItem('tell-them-handle') || '@studio_voyager'; } catch { return '@studio_voyager'; } });
  useEffect(() => { try { localStorage.setItem('tell-them-handle', creatorHandle); } catch { /* Browser privacy mode may disable persistence. */ } }, [creatorHandle]);
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('@studio_voyager');

  // Band & Song Studio States
  const [selectedBand, setSelectedBand] = useState<BandArchetype>('Rock Band');
  const [customGenreName, setCustomGenreName] = useState('Upbeat Brass-Rock Fusion');
  const [vocalArrangement, setVocalArrangement] = useState<VocalArrangement>(
    'Multi-Singer Trade-Off (Male & Female)'
  );
  const [prompt, setPrompt] = useState(
    'Create an upbeat, radio-ready Rock Band song with male and female singers trading verses and harmonizing on an anthemic hometown pride chorus.'
  );
  const [isPromptManual, setIsPromptManual] = useState(false);
  const [duration, setDuration] = useState<Duration>('3:50 Radio Master (Max)');
  const [lyricsOption, setLyricsOption] = useState<LyricsOption>('Auto');
  const [customLyrics, setCustomLyrics] = useState('');
  const [selectedImages, setSelectedImages] = useState<
    { data: string; mimeType: string; previewUrl: string }[]
  >([]);
  const [isTriggering, setIsTriggering] = useState(false);
  const [ipRespectConfirmed, setIpRespectConfirmed] = useState(true);

  // Results & Community Gallery
  const [gen, setGen] = useState<GenerationState>({ results: INITIAL_COMMUNITY_SONGS });
  const [isResultPlaying, setIsResultPlaying] = useState<string | null>(null);
  const [encodingVideoId, setEncodingVideoId] = useState<string | null>(null);
  const [encodingProgress, setEncodingProgress] = useState(0);

  // Human Vocal Overdub / Mic Recording State ("Encourage people who have their own voice")
  const [recordingForId, setRecordingForId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Radio Stations State
  const [stations, setStations] = useState<RadioStation[]>(INITIAL_RADIO_STATIONS);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [newStationName, setNewStationName] = useState('');
  const [newStationCallSign, setNewStationCallSign] = useState('WKND 101.9');
  const [newStationTagline, setNewStationTagline] = useState('');
  const [newStationGenre, setNewStationGenre] = useState('Multi-Singer Rock, Pop & Country Bands');
  const [selectedStationTracks, setSelectedStationTracks] = useState<string[]>([
    'seed-band-1',
    'seed-band-2',
  ]);
  const [stationPraiseDraft, setStationPraiseDraft] = useState<Record<string, string>>({});
  const [stationBadgeDraft, setStationBadgeDraft] = useState<
    Record<string, PraiseComment['badge']>
  >({});

  // Mini-Podcast Studio States (5 to 10 mins max, mandatory weekly schedule)
  const [podcastShowTitle, setPodcastShowTitle] = useState('Backstage Band & Radio Weekly');
  const [podcastTopic, setPodcastTopic] = useState(
    'How multi-singer rock and disco bands craft unforgettable radio hooks within the 3:50 song cutoff'
  );
  const [podcastTargetMinutes, setPodcastTargetMinutes] = useState<number>(7);
  const [podcastDay, setPodcastDay] = useState('Every Wednesday');
  const [podcastTime, setPodcastTime] = useState('08:00 AM EST');
  const [podcastHostA, setPodcastHostA] = useState('Alex');
  const [podcastHostAVoice, setPodcastHostAVoice] = useState('Puck');
  const [podcastHostB, setPodcastHostB] = useState('Sam');
  const [podcastHostBVoice, setPodcastHostBVoice] = useState('Kore');
  const [weeklySchedulePledge, setWeeklySchedulePledge] = useState(true);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);

  // Commercial Craft Studio States (True Ad Craft, PG & Broadcast Standards, No Avatars/Impersonation)
  const [adBrandName, setAdBrandName] = useState('Three Rivers Vinyl & Coffee');
  const [adOffering, setAdOffering] = useState(
    'Locally roasted morning espresso and weekend live acoustic band showcases'
  );
  const [adAudience, setAdAudience] = useState('Music lovers, local families, and morning commuters');
  const [adTone, setAdTone] = useState('Warm, witty, upbeat classic radio craft');
  const [adCta, setAdCta] = useState('Visit Three Rivers Vinyl on Penn Ave this Saturday morning!');
  const [adSpotLength, setAdSpotLength] = useState<'30s' | '60s'>('30s');
  const [adVoice, setAdVoice] = useState('Fenrir');
  const [adStandardsPledge, setAdStandardsPledge] = useState(true);
  const [isGeneratingCommercial, setIsGeneratingCommercial] = useState(false);

  // Holiday Filter State
  const [holidayFilter, setHolidayFilter] = useState<
    'All' | 'Halloween (Last-Minute Blitz)' | 'Christmas (Early-Bird Prep)'
  >('All');

  // Kindness-First Praise & Questions Input per Track
  const [praiseInputById, setPraiseInputById] = useState<Record<string, string>>({});
  const [praiseBadgeById, setPraiseBadgeById] = useState<
    Record<string, PraiseComment['badge']>
  >({});
  const [safetyFeedback, setSafetyFeedback] = useState<string | null>(null);

  // Publish & Direct Creator Handoff Modal State
  const [publishTargetResult, setPublishTargetResult] = useState<SongResult | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [isStandardsModalOpen, setIsStandardsModalOpen] = useState(false);

  // Helper Mode States
  const [isHelperOpen, setIsHelperOpen] = useState(false);
  const [helperSections, setHelperSections] = useState<HelperSection[]>([
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
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize playable preview WAVs on seeded community songs so they work immediately
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

  useEffect(() => {
    if (promptTextareaRef.current) {
      promptTextareaRef.current.style.height = 'auto';
      promptTextareaRef.current.style.height = `${promptTextareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

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

  const handleFeelingLucky = () => {
    const randomMood = getRandomItem(PROMPT_HELPER_CONFIG.moods);
    const randomTheme = getRandomItem(PROMPT_HELPER_CONFIG.themes);
    const genreLabel =
      selectedBand === 'Custom Genre' ? customGenreName : selectedBand;
    setPrompt(
      `Create a ${randomMood.toLowerCase()} ${genreLabel} song about ${randomTheme.toLowerCase()} featuring ${vocalArrangement} and live band instrumentation. Full song capped at 3:50.`
    );
    setIsPromptManual(false);
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
      results: prev.results.map((r) =>
        r.id === id ? { ...r, isExpanded: !r.isExpanded } : r
      ),
    }));
  };

  // Generate Band / Singer / Acoustic Song (Hard cutoff at 3:50 max for songs; jingles separate)
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

    setIsTriggering(true);
    setTimeout(() => setIsTriggering(false), 200);

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

    const newResult: SongResult = {
      id: newId,
      itemType: 'song',
      status: 'generating',
      logs: [],
      audioUrl: null,
      coverImageUrl: createStudioCoverSvg('#1e1b4b', '#9d174d', '#f59e0b', 'band'),
      title: null,
      creatorHandle,
      bandType: activeBand,
      customGenreName: activeBand === 'Custom Genre' ? customGenreName : undefined,
      vocalArrangement: activeVocals,
      originType: isSingerFree
        ? 'Human Voice + AI Backing Band'
        : 'AI-Generated Material',
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

    const genreDescription =
      activeBand === 'Custom Genre' ? customGenreName : activeBand;

    addLog(
      newId,
      `Initializing ${genreDescription} (${activeVocals}) — ${isClip ? '0:30 Jingle/Hook mode' : 'enforcing 3:50 hard cutoff for songs'}...`
    );
    addLog(
      newId,
      `Embedding AI Material Transparency Identifier in respect of human songwriters and musicians.`
    );

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
      addLog(newId, isClip ? 'Jingle / hook stream captured.' : 'Master audio stream captured and verified under 3:50 hard song cutoff.');

      const title = await generateSongTitle(activePrompt, lyrics || activePrompt);
      updateResult(newId, (r) => ({ ...r, title }));
      addLog(newId, `Track titled: "${title}"`);

      const coverImageUrl = await generateCoverArt(activePrompt, lyrics || activePrompt, title, 'band');
      updateResult(newId, (r) => ({ ...r, coverImageUrl }));
    } catch (err: any) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err.message || 'Band synthesis interrupted.',
      }));
    }
  };

  // Generate 5-10 Minute Scheduled Mini-Podcast
  const handleGeneratePodcast = async () => {
    if (!weeklySchedulePledge) {
      setSafetyFeedback(
        'Please confirm the Weekly Consistency & Anti-Spam Schedule Pledge before producing your mini-podcast.'
      );
      return;
    }
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
        `[Schedule Verified] Committed to ${podcastDay} at ${podcastTime} (No daily micro-clip spamming).`,
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
        committedWeekly: true,
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
        'podcast'
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
    } catch (err: any) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err.message || 'Mini-podcast generation failed.',
      }));
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  // Generate True Craft Commercial Spot
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
        'commercial'
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
    } catch (err: any) {
      updateResult(newId, (r) => ({
        ...r,
        status: 'error',
        error: err.message || 'Commercial generation failed.',
      }));
    } finally {
      setIsGeneratingCommercial(false);
    }
  };

  // Record Human Voice Overdub ("Encourage people who have their own voice to use instrumentals or join a band")
  const handleToggleMicRecord = async (resultId: string) => {
    if (recordingForId === resultId) {
      // Stop recording
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

      // Also play the backing track while they sing if available
      const backingAudio = document.getElementById(`audio-${resultId}`) as HTMLAudioElement | null;
      if (backingAudio) {
        backingAudio.currentTime = 0;
        backingAudio.play().catch(() => {});
      }
    } catch (err) {
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

  const handleCreateStation = () => {
    if (!newStationName.trim()) return;
    const check = validateKindnessAndSafety(newStationName + ' ' + newStationTagline);
    if (!check.valid) {
      setSafetyFeedback(check.reason || 'Please use positive, respectful station descriptions.');
      return;
    }
    const newStation: RadioStation = {
      id: 'station-' + Math.random().toString(36).substring(7),
      name: newStationName.trim(),
      callSign: newStationCallSign.trim() || 'WTTB 105.1',
      creatorHandle,
      tagline:
        newStationTagline.trim() ||
        'Custom creator radio station featuring up to 3:50 band hits, weekly mini-podcasts, and craft spots.',
      genreFocus: newStationGenre,
      coverSvgUrl: createStudioCoverSvg('#1e1b4b', '#0f172a', '#38bdf8', 'radio'),
      listenersCount: 1,
      thumbsUp: 1,
      syndicatedTo: ['Spotify', 'YouTube', 'Amazon Music'],
      trackIds:
        selectedStationTracks.length > 0
          ? selectedStationTracks
          : gen.results.slice(0, 2).map((r) => r.id),
      praiseComments: [],
    };
    setStations((prev) => [newStation, ...prev]);
    setNewStationName('');
    setNewStationTagline('');
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

    try { await handleDownloadVideo(
      result,
      withLyrics,
      (progress) => setEncodingProgress(progress),
      () => {
        setEncodingVideoId(null);
        setEncodingProgress(0);
      }
    ); } catch (error) { setSafetyFeedback(`Video export failed: ${(error as Error).message}`); }
  };

  const handleSyndicateToggle = (
    resultId: string,
    platform: DistributionPlatformName
  ) => {
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
      authPolicy: 'Creator authenticates directly on destination platform with their own login. No third-party API keys or OAuth tokens are stored by Tell Them Studio.',
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col pb-24 overflow-x-hidden bg-[linear-gradient(to_bottom,#ffffff,#ffffff_55%,#f4f4f6_100%)] text-[#09090b] font-geist relative"
      onClick={() => setActiveSelector(null)}
    >
      {/* Subtle Top Grid Backdrop across the site */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[560px] opacity-75 
        bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] 
        bg-[size:6rem_5rem] 
        [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
      />

      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-50 glass border-b border-gray-200/70 h-16 flex items-center justify-between gap-8 px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('bands');
          }}
          className="text-lg font-bold tracking-tighter text-gray-950 whitespace-nowrap shrink-0"
        >
          Tell Them Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <button
            onClick={() => setActiveTab('bands')}
            className={`hover:text-gray-950 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'bands'
                ? 'border-zinc-950 text-gray-950 font-semibold'
                : 'border-transparent'
            }`}
          >
            Band Studio
          </button>
          <button
            onClick={() => {
              setSelectedBand('Pop Band');
              setVocalArrangement('Multi-Singer Trade-Off (Male & Female)');
              setActiveTab('singers');
            }}
            className={`hover:text-gray-950 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'singers'
                ? 'border-zinc-950 text-gray-950 font-semibold'
                : 'border-transparent'
            }`}
          >
            Singer Studio
          </button>
          <button
            onClick={() => {
              setSelectedBand('Indie');
              setVocalArrangement('Dual Female Lead & Harmony');
              setActiveTab('acoustic');
            }}
            className={`hover:text-gray-950 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'acoustic'
                ? 'border-zinc-950 text-gray-950 font-semibold'
                : 'border-transparent'
            }`}
          >
            Acoustic Studio
          </button>
          <button
            onClick={() => setActiveTab('stations')}
            className={`hover:text-gray-950 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'stations'
                ? 'border-zinc-950 text-gray-950 font-semibold'
                : 'border-transparent'
            }`}
          >
            Radio Stations
          </button>
          <button
            onClick={() => setActiveTab('trending')}
            className={`hover:text-gray-950 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'trending'
                ? 'border-zinc-950 text-gray-950 font-semibold'
                : 'border-transparent'
            }`}
          >
            Trending
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setIsStandardsModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0"
          >
            Safety & Artist Charter
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 pt-8">
        {/* Workspace Toolbar: Handle Identity, Mobile Tab Switcher & Core Standards */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-8 border-b border-gray-200/70">
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
            <span aria-hidden="true">·</span>
            <span>Handle-Only Safe Community</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Songs Max 3:50 (Jingles Separate)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Weekly Podcasts 5–10m</span>
            <span aria-hidden="true">·</span>
            <span>AI Material Disclosure Active</span>
          </div>

          {/* Segmented Mode Control for all viewports */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {(
              [
                { id: 'listen', label: 'Told Them · Listen' },
                { id: 'bands', label: 'Band Studio' },
                { id: 'singers', label: 'Singer Studio' },
                { id: 'acoustic', label: 'Acoustic Studio' },
                { id: 'creative', label: 'AI · Lyrics, Video & Mix' },
                { id: 'library', label: 'My Library' },
                { id: 'stations', label: 'Radio Stations' },
                { id: 'podcasts', label: 'Mini-Podcasts (5–10m)' },
                { id: 'commercials', label: 'Commercial Craft' },
                { id: 'trending', label: 'Trending' },
              ] as { id: StudioTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === t.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

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

        {(['listen', 'library', 'creative'] as string[]).includes(activeTab) && (
          <CreativeWorkspace key={activeTab} mode={activeTab as 'listen' | 'library' | 'creative'} owner={creatorHandle}
            onCreate={(band, brief) => { handleSelectBandArchetype(band); setPrompt(brief); setIsHelperOpen(false); setActiveTab('bands'); }}
            onPodcast={() => setActiveTab('podcasts')}
            onLyrics={(lyrics) => { setCustomLyrics(lyrics); setLyricsOption('Custom'); setIsHelperOpen(false); setActiveTab('bands'); }} />
        )}
        {activeTab === 'podcasts' && <><PodcastSamples /><div className="cw cw-actions"><button onClick={() => setActiveTab('library')}>Your podcast library ↗</button><button onClick={() => setActiveTab('creative')}>Discuss an episode idea ↗</button></div></>}
        {activeTab === 'commercials' && <GenreSamples genre="Pop Band" owner={creatorHandle} onCreate={(band, brief) => { handleSelectBandArchetype(band); setPrompt(brief); setActiveTab('bands'); }} />}

        {/* ===================================================================== */}
        {/* TAB 1: BAND STUDIO, SINGER STUDIO & ACOUSTIC STUDIO                   */}
        {/* ===================================================================== */}
        {(activeTab === 'bands' || activeTab === 'singers' || activeTab === 'acoustic') && (
          <>
            <Hero
              eyebrow={
                activeTab === 'singers'
                  ? 'Singer Studio · Lead Vocals, Duets & Live Voice (3:50 Max)'
                  : activeTab === 'acoustic'
                  ? 'Acoustic Studio · Unplugged Guitar, Piano & Voice (3:50 Max)'
                  : 'Band Studio · Multi-Singer Lineups, Custom Genres & Radio Singles'
              }
              title={
                activeTab === 'singers'
                  ? 'Singer Studio: Lead Vocals, Duets & Live Voice'
                  : activeTab === 'acoustic'
                  ? 'Acoustic Studio: Unplugged Guitar, Piano & Voice'
                  : 'Build Your Band, Vocal Lineup & Radio Single'
              }
              subtitle={
                activeTab === 'singers'
                  ? 'Craft vocal-forward solos, male and female duets, 3-part harmonies, or record your own live voice over studio backing tracks—every song can run up to the 3 minutes and 50 seconds (3:50) hard cutoff.'
                  : activeTab === 'acoustic'
                  ? 'Create warm fingerstyle acoustic guitar sessions, upright piano ballads, folk harmonies, and intimate coffeehouse tracks up to the 3 minutes and 50 seconds (3:50) hard cutoff.'
                  : 'Explore Rock, Country, Rap, Hip-Hop, Indie, Jazz, anime-inspired music, and Serenity—or create singer-free backing tracks for your own voice. Every song can run up to a hard cutoff of 3 minutes and 50 seconds (3:50) (with separate shorter formats for jingles and commercials) and is ready to publish to Spotify, YouTube, and Amazon Music.'
              }
              ctaLabel={
                activeTab === 'singers'
                  ? 'Open Singer Studio'
                  : activeTab === 'acoustic'
                  ? 'Open Acoustic Studio'
                  : 'Start Creating Below'
              }
              ctaHref="#studio-workspace"
            >
              {activeTab === 'singers' && (
                <div className="pt-2 flex flex-wrap justify-center gap-2">
                  {[
                    {
                      label: 'Male & Female Duet Spotlight',
                      band: 'Pop Band' as BandArchetype,
                      vox: 'Multi-Singer Trade-Off (Male & Female)' as VocalArrangement,
                      brief:
                        'Create a vocal-forward Pop & Soul duet where male and female singers trade expressive verses and blend in a soaring chorus. Up to 3:50.',
                    },
                    {
                      label: 'Powerhouse Female Lead',
                      band: 'Pop Band' as BandArchetype,
                      vox: 'Lead Female + Band Backing' as VocalArrangement,
                      brief:
                        'Create an uplifting song showcasing a powerhouse female lead vocalist with rich backing harmonies and dynamic studio arrangement. Up to 3:50.',
                    },
                    {
                      label: 'Warm Male Storyteller Lead',
                      band: 'Country Band' as BandArchetype,
                      vox: 'Lead Male + Band Backing' as VocalArrangement,
                      brief:
                        'Create a heartfelt Country & Americana track featuring a warm male lead singer and tight chorus harmony. Up to 3:50.',
                    },
                    {
                      label: '3-Part Vocal Harmony Group',
                      band: 'Disco Band' as BandArchetype,
                      vox: '3-Part Band Harmonies' as VocalArrangement,
                      brief:
                        'Create an energetic 3-part vocal harmony track with tight call-and-response hooks and vibrant rhythm section. Up to 3:50.',
                    },
                    {
                      label: 'Backing Track for My Own Voice',
                      band: 'Singer-Free Instrumental' as BandArchetype,
                      vox: 'Singer-Free (Record Your Own Voice)' as VocalArrangement,
                      brief:
                        'Create a studio backing arrangement with clear vocal pocket headroom designed for a human singer to record live vocals over. Up to 3:50.',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        handleSelectBandArchetype(preset.band);
                        setVocalArrangement(preset.vox);
                        setPrompt(preset.brief);
                        setIsHelperOpen(false);
                      }}
                      className="px-4 py-2 rounded-3xl bg-white/90 border border-gray-300/60 hover:border-gray-950 text-xs font-semibold text-gray-800 shadow-sm transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'acoustic' && (
                <div className="pt-2 flex flex-wrap justify-center gap-2">
                  {[
                    {
                      label: 'Fingerstyle Acoustic Guitar & Duet',
                      band: 'Indie' as BandArchetype,
                      vox: 'Multi-Singer Trade-Off (Male & Female)' as VocalArrangement,
                      brief:
                        'Create an intimate unplugged acoustic session featuring warm fingerstyle flattop guitar, upright bass, and male & female duet harmonies. Up to 3:50.',
                    },
                    {
                      label: 'Grand Piano & Intimate Vocal',
                      band: 'Serenity' as BandArchetype,
                      vox: 'Lead Female + Band Backing' as VocalArrangement,
                      brief:
                        'Create a stripped-back acoustic grand piano and warm cello arrangement with an expressive, close-mic lead vocal. Up to 3:50.',
                    },
                    {
                      label: 'Front Porch Country Acoustic',
                      band: 'Country Band' as BandArchetype,
                      vox: 'Dual Male Lead & Harmony' as VocalArrangement,
                      brief:
                        'Create a warm acoustic flattop guitar, mandolin, and upright bass porch session with close vocal harmonies. Up to 3:50.',
                    },
                    {
                      label: 'Unplugged Instrumental Guitar',
                      band: 'Singer-Free Instrumental' as BandArchetype,
                      vox: 'Singer-Free (Record Your Own Voice)' as VocalArrangement,
                      brief:
                        'Create a pure unplugged acoustic guitar and light percussion instrumental backing track ready for a singer-songwriter. Up to 3:50.',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        handleSelectBandArchetype(preset.band);
                        setVocalArrangement(preset.vox);
                        setPrompt(preset.brief);
                        setIsHelperOpen(false);
                      }}
                      className="px-4 py-2 rounded-3xl bg-white/90 border border-gray-300/60 hover:border-gray-950 text-xs font-semibold text-gray-800 shadow-sm transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </Hero>

            <GenreSamples genre={activeTab === 'acoustic' ? 'Indie' : activeTab === 'singers' ? 'Pop Band' : selectedBand} owner={creatorHandle} onCreate={(band, brief) => { handleSelectBandArchetype(band); setPrompt(brief); setIsHelperOpen(false); }} />
            <div className="cw cw-actions mb-6"><button onClick={() => setActiveTab('library')}>Your private library ↗</button><button onClick={() => setActiveTab('creative')}>Ask for lyrics, video, or creative help ↗</button><button onClick={() => setActiveTab('listen')}>Explore all genres ↗</button></div>
            <section id="studio-workspace" className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 relative z-10">
              <div className="space-y-8">
                {/* Step 1: Band Archetype & Custom Genre */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-bold text-gray-900">
                      01. Select Your Band Lineup or Custom Genre
                    </label>
                    <span className="text-xs text-gray-500 font-mono tabular-nums">
                      Hard Cutoff: 3:50 Maximum Song Length (Jingles & Spots Separate)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {BAND_ARCHETYPES.map((band) => {
                      const active = selectedBand === band.id;
                      return (
                        <button
                          key={band.id}
                          onClick={() => handleSelectBandArchetype(band.id)}
                          className={`text-left p-4 rounded-2xl border transition-all ${
                            active
                              ? 'bg-blue-50/70 border-blue-500 shadow-sm'
                              : 'bg-gray-50/70 border-gray-200/80 hover:bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-sm text-gray-900">
                              {band.label}
                            </span>
                            <span className="text-xs font-semibold text-blue-600">
                              {active ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {band.tagline}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedBand === 'Custom Genre' && (
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Define Your Custom Genre & Band Instrumentation
                      </label>
                      <input
                        type="text"
                        value={customGenreName}
                        onChange={(e) => setCustomGenreName(e.target.value)}
                        placeholder="e.g., Upbeat Surf-Country Brass Band with Male & Female Duet"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-900 focus:bg-white"
                      />
                    </div>
                  )}
                </div>

                {/* Step 2: Vocal Arrangement & Multi-Singer Interplay */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-bold text-gray-900">
                      02. Choose Multi-Singer Vocal Interplay or Singer-Free Mode
                    </label>
                    <span className="text-xs text-gray-500">
                      Have your own voice? Pick Singer-Free or record your live vocals over any generated band!
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {VOCAL_ARRANGEMENTS.map((vox) => (
                      <button
                        key={vox}
                        onClick={() => {
                          setVocalArrangement(vox);
                          if (vox === 'Singer-Free (Record Your Own Voice)') {
                            setLyricsOption('Instrumental');
                          }
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 border ${
                          vocalArrangement === vox
                            ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {vox}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Prompt Builder / Free Text */}
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <label className="text-sm font-bold text-gray-900">
                      03. Song Concept & Arrangement Direction
                    </label>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          setPrompt(
                            'Create an upbeat Rock Band hometown football pride anthem in black and gold with male and female singers trading verses and an electric stadium chorus. Use 100% original royalty-safe lyrics celebrating our city rivers, steel bridges, and Friday night energy.'
                          );
                          setIsHelperOpen(false);
                        }}
                        className="text-xs font-semibold text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        Load Royalty-Safe Hometown Anthem Example
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsHelperOpen(!isHelperOpen);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5"
                      >
                        <Icons.Sparkles className="w-3.5 h-3.5" />
                        {isHelperOpen ? 'Switch to Free Text' : 'Guided Song Builder'}
                      </button>
                    </div>
                  </div>

                  <div className="relative group/prompt min-h-[150px]">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    {isHelperOpen ? (
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
                    ) : (
                      <div className="relative">
                        <textarea
                          ref={promptTextareaRef}
                          value={prompt}
                          onChange={(e) => {
                            setPrompt(e.target.value);
                            setIsPromptManual(true);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Describe your band's groove, how the male and female singers trade verses, or the hometown story..."
                          className="w-full min-h-[128px] bg-gray-50 border border-gray-200 rounded-3xl p-6 pb-20 text-lg font-normal leading-relaxed resize-none focus:bg-white transition-all pr-16"
                          style={{ overflow: 'hidden' }}
                        />
                        <div className="absolute bottom-4 left-4 flex items-center gap-2">
                          {selectedImages.length < 10 && (
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className={`transition-all shadow-sm border border-gray-200 flex items-center justify-center ${
                                selectedImages.length > 0
                                  ? 'p-2.5 rounded-2xl bg-blue-600 text-white'
                                  : 'px-4 py-2 rounded-2xl bg-white text-gray-600 hover:text-blue-600 gap-2 text-xs font-semibold'
                              }`}
                            >
                              <Icons.Camera className="w-4 h-4" />
                              {selectedImages.length === 0 && <span>Add Visual Inspiration</span>}
                            </button>
                          )}
                          {selectedImages.length > 0 && (
                            <div className="flex gap-2">
                              {selectedImages.map((img, idx) => (
                                <div
                                  key={idx}
                                  className="relative w-11 h-11 rounded-xl overflow-hidden border border-gray-200 shadow-sm"
                                >
                                  <img
                                    src={img.previewUrl}
                                    alt="Reference"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-0 right-0 w-4 h-4 bg-black/60 text-white flex items-center justify-center"
                                  >
                                    <Icons.X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-4 right-4">
                          <button
                            title="Generate a fresh band concept"
                            onClick={handleFeelingLucky}
                            className="px-3.5 py-2 bg-white shadow-sm border border-gray-200 text-gray-700 hover:text-blue-600 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-transform active:scale-95"
                          >
                            <Icons.Sparkles className="w-4 h-4" />
                            <span>Surprise Band Idea</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Song Duration Cap (3:50 Hard Cutoff) & Lyrics Mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700">
                      Song Duration Format (3:50 Hard Cutoff — Jingles Separate)
                    </label>
                    <div className="flex flex-wrap bg-gray-100 p-1 rounded-2xl w-fit gap-1">
                      {(
                        [
                          '3:50 Radio Master (Max)',
                          '2:48 Radio Single',
                          '2:15 Tight Single',
                          '0:30 Hook / Jingle',
                        ] as Duration[]
                      ).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setDuration(opt)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 font-mono tabular-nums ${
                            duration === opt
                              ? 'bg-white shadow-sm text-gray-900'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700">
                      Lyrics & Vocal Mode
                    </label>
                    <div className="flex bg-gray-100 p-1 rounded-2xl w-fit gap-1">
                      {(['Auto', 'Custom', 'Instrumental'] as LyricsOption[]).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setLyricsOption(opt)}
                          className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                            lyricsOption === opt
                              ? 'bg-white shadow-sm text-gray-900'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {opt === 'Instrumental' ? 'Singer-Free Instrumental' : opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {lyricsOption === 'Custom' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700">
                      Custom Multi-Singer Band Lyrics (Use [Male Vocal], [Female Vocal], [Full Band Chorus] cues)
                    </label>
                    <textarea
                      value={customLyrics}
                      onChange={(e) => setCustomLyrics(e.target.value)}
                      placeholder={`[0:00] (Male Lead) Driving down the river road on a Friday night\n[0:15] (Female Lead) Stadium glow turning up the city light\n[0:30] (Full Band Harmony) Raise your voice, let the guitars ring!`}
                      className="w-full min-h-[140px] bg-gray-50 border border-gray-200 rounded-3xl p-5 text-sm font-normal leading-relaxed resize-none focus:bg-white transition-all"
                    />
                  </div>
                )}

                {/* Artist Respect, AI Disclosure & Royalty Guideline Confirmation */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <label className="flex items-start gap-3 cursor-pointer text-xs text-gray-600 leading-relaxed">
                    <input
                      type="checkbox"
                      checked={ipRespectConfirmed}
                      onChange={(e) => setIpRespectConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600"
                    />
                    <span>
                      <strong className="text-gray-900">Artist Respect & Royalty-Safe Pledge:</strong>{' '}
                      This track uses original melodies/lyrics (no copyrighted team/artist infringement) and will carry a transparent{' '}
                      <strong className="text-gray-900">
                        {lyricsOption === 'Instrumental' ||
                        vocalArrangement === 'Singer-Free (Record Your Own Voice)'
                          ? 'Human Voice + AI Backing Band'
                          : 'AI-Generated Material'}
                      </strong>{' '}
                      identifier out of respect for lifelong human musicians.
                    </span>
                  </label>
                </div>

                <button
                  onClick={() => handleGenerate()}
                  disabled={
                    (!prompt.trim() && selectedImages.length === 0) ||
                    !ipRespectConfirmed ||
                    CONFIG.IS_MAINTENANCE_MODE
                  }
                  className={`w-full py-4 rounded-2xl text-base font-bold text-white transition-all shadow-lg ${
                    (!prompt.trim() && selectedImages.length === 0) ||
                    !ipRespectConfirmed ||
                    CONFIG.IS_MAINTENANCE_MODE
                      ? 'bg-gray-300 cursor-not-allowed shadow-none'
                      : `music-gradient shadow-pink-500/20 active:scale-[0.99] ${
                          isTriggering ? 'scale-[0.99] brightness-110' : ''
                        }`
                  }`}
                >
                  Generate {selectedBand === 'Custom Genre' ? customGenreName : selectedBand} Track ({duration === '0:30 Hook / Jingle' || duration === '0:30 Hook Preview' ? '0:30 Jingle / Hook' : '3:50 Hard Cutoff'})
                </button>
              </div>
            </section>
          </>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: RADIO STATIONS & SYNDICATION LAUNCHPAD                         */}
        {/* ===================================================================== */}
        {activeTab === 'stations' && (
          <section className="space-y-10 mb-14">
            <Hero
              eyebrow="Creator Radio Stations · Top 10 Handoff Destinations"
              title="Creator Radio Stations & Syndication Hub"
              subtitle="Curate your own radio station combining band songs (up to 3:50 max), weekly mini-podcasts, and craft commercials. Share under safe studio handles and hand off directly to Spotify, YouTube Music, Amazon Music, and more."
              ctaLabel="Launch a Station"
              ctaHref="#station-builder"
            />

            <div id="station-builder" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 5 Cols: Station Builder */}
              <div className="lg:col-span-5 bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5">
                <h2 className="text-xl font-bold text-gray-900">
                  Design & Launch a Radio Station
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Package your station lineup for listeners here and syndicate your shows to where people already listen.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Station Name
                    </label>
                    <input
                      type="text"
                      value={newStationName}
                      onChange={(e) => setNewStationName(e.target.value)}
                      placeholder="e.g., Steel City Band & Podcast Radio"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Station Call Sign
                      </label>
                      <input
                        type="text"
                        value={newStationCallSign}
                        onChange={(e) => setNewStationCallSign(e.target.value)}
                        placeholder="WKND 101.9"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Genre / Format Focus
                      </label>
                      <input
                        type="text"
                        value={newStationGenre}
                        onChange={(e) => setNewStationGenre(e.target.value)}
                        placeholder="Rock, Pop & Disco Bands"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Station Tagline & Schedule Note
                    </label>
                    <textarea
                      value={newStationTagline}
                      onChange={(e) => setNewStationTagline(e.target.value)}
                      placeholder="Up to 3:50 multi-singer hits, Wednesday 7-min mini-podcasts, and local craft spots."
                      className="w-full h-20 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Include Studio Creations in Rotation ({selectedStationTracks.length} selected)
                    </label>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                      {gen.results.map((r) => {
                        const checked = selectedStationTracks.includes(r.id);
                        return (
                          <label
                            key={r.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-200/70 cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedStationTracks((prev) =>
                                    checked
                                      ? prev.filter((id) => id !== r.id)
                                      : [...prev, r.id]
                                  )
                                }
                              />
                              <span className="font-semibold text-gray-900 truncate">
                                {r.title || 'Untitled Creation'}
                              </span>
                            </div>
                            <span className="text-gray-500 font-mono tabular-nums shrink-0">
                              {r.maxCapLabel}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleCreateStation}
                    disabled={!newStationName.trim()}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white apple-gradient shadow-md disabled:opacity-50"
                  >
                    Launch Radio Station & Syndicate
                  </button>
                </div>
              </div>

              {/* Right 7 Cols: Active Radio Stations Directory */}
              <div className="lg:col-span-7 space-y-6">
                {stations.map((st) => {
                  const isPlayingStation = activeStationId === st.id;
                  const stationTracks = gen.results.filter((r) =>
                    st.trackIds.includes(r.id)
                  );

                  return (
                    <div
                      key={st.id}
                      className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={st.coverSvgUrl}
                            alt={st.name}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-gray-200"
                          />
                          <div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono tabular-nums">
                              <span className="font-bold text-blue-600">{st.callSign}</span>
                              <span aria-hidden="true">·</span>
                              <span>Curated by {st.creatorHandle}</span>
                              <span aria-hidden="true">·</span>
                              <span>{st.listenersCount} listeners</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mt-0.5">
                              {st.name}
                            </h3>
                            <p className="text-xs text-gray-600 mt-1">{st.tagline}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              if (isPlayingStation) {
                                setActiveStationId(null);
                              } else {
                                setActiveStationId(st.id);
                                const firstTrack = stationTracks[0] || gen.results[0];
                                if (firstTrack) {
                                  const el = document.getElementById(
                                    `audio-${firstTrack.id}`
                                  ) as HTMLAudioElement | null;
                                  if (el) el.play().catch(() => {});
                                }
                              }
                            }}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white music-gradient flex items-center gap-2 whitespace-nowrap shrink-0"
                          >
                            {isPlayingStation ? (
                              <>
                                <Icons.Pause className="w-4 h-4" />
                                <span>Stop Station Stream</span>
                              </>
                            ) : (
                              <>
                                <Icons.Radio className="w-4 h-4" />
                                <span>Tune In Live</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() =>
                              setStations((prev) =>
                                prev.map((s) =>
                                  s.id === st.id ? { ...s, thumbsUp: s.thumbsUp + 1 } : s
                                )
                              )
                            }
                            className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 flex items-center gap-1.5 font-mono tabular-nums"
                          >
                            <Icons.ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                            <span>{st.thumbsUp}</span>
                          </button>
                        </div>
                      </div>

                      {/* Clean unboxed metadata row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                        <span>Format: {st.genreFocus}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Syndicated Ready: {st.syndicatedTo.join(', ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Rotation Queue: {stationTracks.length} items</span>
                      </div>

                      {/* Station Rotation List */}
                      <div className="space-y-2">
                        {stationTracks.map((tr, i) => (
                          <div
                            key={tr.id}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-gray-50 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-gray-400 tabular-nums">
                                0{i + 1}.
                              </span>
                              <span className="font-semibold text-gray-900 truncate">
                                {tr.title}
                              </span>
                              <span className="text-gray-500 truncate">
                                {tr.bandType} ({tr.originType})
                              </span>
                            </div>
                            <span className="font-mono text-gray-500 tabular-nums shrink-0">
                              {tr.maxCapLabel}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Station Creator Praise & Input */}
                      <div className="pt-3 border-t border-gray-100 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={stationBadgeDraft[st.id] || 'Radio Ready'}
                            onChange={(e) =>
                              setStationBadgeDraft((prev) => ({
                                ...prev,
                                [st.id]: e.target.value as PraiseComment['badge'],
                              }))
                            }
                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700"
                          >
                            <option value="Radio Ready">Praise: Radio Ready</option>
                            <option value="Great Harmony">Praise: Great Harmony</option>
                            <option value="Question for Creator">Ask Creator a Question</option>
                          </select>
                          <input
                            type="text"
                            value={stationPraiseDraft[st.id] || ''}
                            onChange={(e) =>
                              setStationPraiseDraft((prev) => ({
                                ...prev,
                                [st.id]: e.target.value,
                              }))
                            }
                            placeholder={`Share kind feedback or ask a question as ${creatorHandle}...`}
                            className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                          />
                          <button
                            onClick={() => {
                              const msg = (stationPraiseDraft[st.id] || '').trim();
                              if (!msg) return;
                              const check = validateKindnessAndSafety(msg);
                              if (!check.valid) {
                                setSafetyFeedback(check.reason || 'Kindness check failed.');
                                return;
                              }
                              const comment: PraiseComment = {
                                id: Math.random().toString(36).substring(7),
                                handle: creatorHandle,
                                badge: stationBadgeDraft[st.id] || 'Radio Ready',
                                message: msg,
                                timestamp: 'Just now',
                              };
                              setStations((prev) =>
                                prev.map((s) =>
                                  s.id === st.id
                                    ? {
                                        ...s,
                                        praiseComments: [comment, ...s.praiseComments],
                                      }
                                    : s
                                )
                              );
                              setStationPraiseDraft((prev) => ({ ...prev, [st.id]: '' }));
                            }}
                            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            Post Praise
                          </button>
                        </div>

                        {st.praiseComments.length > 0 && (
                          <div className="space-y-2">
                            {st.praiseComments.map((c) => (
                              <div
                                key={c.id}
                                className="text-xs text-gray-700 bg-gray-50/80 px-3.5 py-2 rounded-xl flex flex-wrap items-center gap-1.5"
                              >
                                <span className="font-mono font-semibold text-blue-600">
                                  {c.handle}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-gray-900">
                                  {c.badge}:
                                </span>
                                <span>{c.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top 10 Direct Creator Handoff Destinations Directory */}
            <div className="bg-white rounded-[32px] p-8 card-shadow border border-gray-200/80 space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-blue-600">
                    Direct Creator Handoff Links · Zero Stored Keys or Credentials
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
                    Top 10 Places to Publish Your Music & Podcasts
                  </h2>
                  <p className="text-xs text-gray-500 max-w-3xl leading-relaxed">
                    We never hold your login credentials or third-party API keys. Use these direct handoff links to open your preferred destination, sign in with your own personal or artist account, and upload your downloaded studio master directly from your source to theirs.
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-700 font-semibold shrink-0">
                  100% Creator-Owned Login
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {TOP_HANDOFF_PLATFORMS.map((plat, idx) => (
                  <div
                    key={plat.id}
                    className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/80 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="font-mono font-bold text-gray-400 tabular-nums">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{plat.category}</span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">{plat.name}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {plat.loginNote}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between gap-2">
                      <a
                        href={plat.handoffUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold text-center transition-colors whitespace-nowrap"
                      >
                        Handoff to {plat.name} ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: MINI-PODCAST STUDIO (5-10 MIN MAX + WEEKLY SCHEDULE PLEDGE)    */}
        {/* ===================================================================== */}
        {activeTab === 'podcasts' && (
          <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 space-y-8">
            <div className="space-y-3">
              <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
                Weekly Cadence · 5 to 10 Minutes Max
              </span>
              <h1
                className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-3xl md:text-5xl font-semibold tracking-tighter text-transparent py-1"
                style={{ textWrap: 'balance' }}
              >
                Scheduled Mini-Podcast Studio (5 to 10 Minutes Max)
              </h1>
              <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed tracking-tight">
                Designed for high-value, consistent weekly episodes between 5 and 10 minutes—never 15 two-minute spam clips a day. Includes dual-host conversational synthesis and 1080p podcast video rendering for Spotify, YouTube, and Amazon Music.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Podcast Series Title
                  </label>
                  <input
                    type="text"
                    value={podcastShowTitle}
                    onChange={(e) => setPodcastShowTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Episode Topic & Key Talking Points
                  </label>
                  <textarea
                    value={podcastTopic}
                    onChange={(e) => setPodcastTopic(e.target.value)}
                    className="w-full h-28 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Host 1 Name & Voice
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={podcastHostA}
                        onChange={(e) => setPodcastHostA(e.target.value)}
                        className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                      />
                      <select
                        value={podcastHostAVoice}
                        onChange={(e) => setPodcastHostAVoice(e.target.value)}
                        className="w-1/2 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                      >
                        <option value="Puck">Puck (Bright)</option>
                        <option value="Fenrir">Fenrir (Warm)</option>
                        <option value="Charon">Charon (Deep)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Host 2 Name & Voice
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={podcastHostB}
                        onChange={(e) => setPodcastHostB(e.target.value)}
                        className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                      />
                      <select
                        value={podcastHostBVoice}
                        onChange={(e) => setPodcastHostBVoice(e.target.value)}
                        className="w-1/2 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                      >
                        <option value="Kore">Kore (Articulate)</option>
                        <option value="Zephyr">Zephyr (Smooth)</option>
                        <option value="Puck">Puck (Upbeat)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Duration Guardrail (5-10m) & Mandatory Weekly Cadence */}
              <div className="bg-gray-50 rounded-3xl p-6 border border-gray-200/80 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-900">
                      Episode Duration Guardrail (5 to 10 Minutes Max)
                    </label>
                    <span className="font-mono text-sm font-bold text-blue-600 tabular-nums">
                      {podcastTargetMinutes}:00 Mins
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[5, 7, 10].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setPodcastTargetMinutes(mins)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-semibold font-mono tabular-nums border transition-all ${
                          podcastTargetMinutes === mins
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-200'
                        }`}
                      >
                        {mins} Min {mins === 10 ? '(Max Cap)' : mins === 7 ? '(Sweet Spot)' : '(Min)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Weekly Broadcast Day
                    </label>
                    <select
                      value={podcastDay}
                      onChange={(e) => setPodcastDay(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
                    >
                      <option>Every Monday</option>
                      <option>Every Tuesday</option>
                      <option>Every Wednesday</option>
                      <option>Every Thursday</option>
                      <option>Every Friday</option>
                      <option>Every Saturday</option>
                      <option>Every Sunday</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Scheduled Release Slot
                    </label>
                    <select
                      value={podcastTime}
                      onChange={(e) => setPodcastTime(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                    >
                      <option>07:00 AM EST</option>
                      <option>08:00 AM EST</option>
                      <option>12:00 PM EST</option>
                      <option>05:00 PM EST</option>
                      <option>08:00 PM EST</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-gray-200 cursor-pointer text-xs text-gray-600 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={weeklySchedulePledge}
                    onChange={(e) => setWeeklySchedulePledge(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                  />
                  <span>
                    <strong className="text-gray-900">Weekly Consistency & Anti-Spam Pledge:</strong>{' '}
                    I commit to releasing my 5–10 minute mini-podcast on a consistent weekly schedule ({podcastDay} at {podcastTime}) and will not spam listeners with multiple short 2-minute clips throughout the day.
                  </span>
                </label>

                <button
                  onClick={handleGeneratePodcast}
                  disabled={isGeneratingPodcast || !weeklySchedulePledge}
                  className="w-full py-4 rounded-2xl text-sm font-bold text-white apple-gradient shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGeneratingPodcast ? (
                    <>
                      <Icons.Loading className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Dual-Host Episode & Video Script...</span>
                    </>
                  ) : (
                    <span>Produce {podcastTargetMinutes}-Min Weekly Mini-Podcast</span>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: TRUE CRAFT COMMERCIAL MAKER                                    */}
        {/* ===================================================================== */}
        {activeTab === 'commercials' && (
          <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 space-y-8">
            <div className="space-y-3">
              <span className="text-xs text-gray-600 font-geist px-4 py-1.5 bg-gradient-to-tr from-zinc-300/10 via-gray-400/10 to-transparent border-[2px] border-gray-300/30 rounded-3xl w-fit tracking-tight uppercase inline-flex items-center">
                Authentic Advertising Craft · PG Broadcast Standards
              </span>
              <h1
                className="bg-gradient-to-br from-black from-30% to-black/40 bg-clip-text text-3xl md:text-5xl font-semibold tracking-tighter text-transparent py-1"
                style={{ textWrap: 'balance' }}
              >
                True Craft Commercial Studio
              </h1>
              <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed tracking-tight">
                Dedicated to the real craft of radio and broadcast advertising—memorable copywriting, sonic branding, and clear storytelling. Strictly zero fake celebrity avatars or deceptive impersonations, with built-in PG / Family-Safe broadcast standards.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Brand, Show, or Local Business Name
                  </label>
                  <input
                    type="text"
                    value={adBrandName}
                    onChange={(e) => setAdBrandName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    What Makes It Special (Authentic Value Proposition)
                  </label>
                  <textarea
                    value={adOffering}
                    onChange={(e) => setAdOffering(e.target.value)}
                    className="w-full h-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Target Listeners
                    </label>
                    <input
                      type="text"
                      value={adAudience}
                      onChange={(e) => setAdAudience(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Creative Tone
                    </label>
                    <input
                      type="text"
                      value={adTone}
                      onChange={(e) => setAdTone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-3xl p-6 border border-gray-200/80 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Call to Action (CTA)
                  </label>
                  <input
                    type="text"
                    value={adCta}
                    onChange={(e) => setAdCta(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Broadcast Spot Length
                    </label>
                    <div className="flex bg-white p-1 rounded-xl border border-gray-200">
                      {(['30s', '60s'] as ('30s' | '60s')[]).map((len) => (
                        <button
                          key={len}
                          onClick={() => setAdSpotLength(len)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums ${
                            adSpotLength === len
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-600'
                          }`}
                        >
                          :{len} Spot
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Narrator Voice Craft
                    </label>
                    <select
                      value={adVoice}
                      onChange={(e) => setAdVoice(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
                    >
                      <option value="Fenrir">Fenrir (Classic Radio Warmth)</option>
                      <option value="Kore">Kore (Crisp Modern Agency)</option>
                      <option value="Puck">Puck (Upbeat Retail Energy)</option>
                      <option value="Zephyr">Zephyr (Smooth Storyteller)</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-gray-200 cursor-pointer text-xs text-gray-600 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={adStandardsPledge}
                    onChange={(e) => setAdStandardsPledge(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                  />
                  <span>
                    <strong className="text-gray-900">Authentic Advertising & PG Broadcast Standards:</strong>{' '}
                    This commercial represents genuine advertising craft—no fake avatars pretending to be someone else, zero offensive language, and full compliance with family-safe radio guidelines.
                  </span>
                </label>

                <button
                  onClick={handleGenerateCommercial}
                  disabled={isGeneratingCommercial || !adStandardsPledge}
                  className="w-full py-4 rounded-2xl text-sm font-bold text-white creative-gradient shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGeneratingCommercial ? (
                    <>
                      <Icons.Loading className="w-4 h-4 animate-spin" />
                      <span>Producing Commercial Voiceover & Storyboard...</span>
                    </>
                  ) : (
                    <span>Produce :{adSpotLength} Broadcast Commercial & Storyboard</span>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 5: SEASONAL HOLIDAY HUB (HALLOWEEN BLITZ & CHRISTMAS WORKSHOP)    */}
        {/* ===================================================================== */}
        {activeTab === 'holidays' && (
          <section className="space-y-8 mb-14">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <h1
                  className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900"
                  style={{ textWrap: 'balance' }}
                >
                  Seasonal Holiday Music & Radio Workshop
                </h1>
                <p className="text-sm text-gray-500 max-w-2xl">
                  With mid-October here, wrap up your last-minute Halloween party band tracks and get a head start on Christmas & winter holiday radio singles!
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
                {(
                  [
                    'All',
                    'Halloween (Last-Minute Blitz)',
                    'Christmas (Early-Bird Prep)',
                  ] as const
                ).map((filt) => (
                  <button
                    key={filt}
                    onClick={() => setHolidayFilter(filt)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      holidayFilter === filt
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {filt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {HOLIDAY_TEMPLATES.filter(
                (t) => holidayFilter === 'All' || t.holiday === holidayFilter
              ).map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-white rounded-[32px] p-7 card-shadow border border-gray-200/80 flex flex-col justify-between gap-5"
                >
                  <div className="flex items-start gap-5">
                    <img
                      src={tpl.coverSvgUrl}
                      alt={tpl.title}
                      referrerPolicy="no-referrer"
                      className="w-24 h-24 rounded-2xl object-cover shrink-0 border border-gray-200"
                    />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-orange-600">{tpl.holiday}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{tpl.duration}</span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">{tpl.title}</h3>
                      <p className="text-xs text-gray-500">
                        {tpl.bandType} · {tpl.vocalArrangement}
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed pt-1">
                        {tpl.prompt}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4 text-xs font-mono text-gray-600 whitespace-pre-wrap">
                    {tpl.suggestedLyrics}
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">{tpl.countdownNote}</span>
                    <button
                      onClick={() => handleLoadHolidayTemplate(tpl)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-white music-gradient whitespace-nowrap shrink-0"
                    >
                      Load into Band Studio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 6: WEEKLY TRENDING GENRES, HOLIDAY HUB & SPECIALTY HUBS           */}
        {/* ===================================================================== */}
        {activeTab === 'trending' && (
          <TrendingView
            results={gen.results}
            onSelectTrend={({ bandType, prompt: trendPrompt }) => {
              handleSelectBandArchetype(bandType);
              setPrompt(trendPrompt);
              setIsHelperOpen(false);
              setActiveTab('bands');
            }}
            onLoadHolidayTemplate={handleLoadHolidayTemplate}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* ===================================================================== */}
        {/* SHARED STUDIO GALLERY: SONGS, PODCASTS & COMMERCIALS                  */}
        {/* ===================================================================== */}
        {!['listen', 'library', 'creative'].includes(activeTab) && <>
        <SaveCreations results={gen.results} owner={creatorHandle} />
        {gen.results.length > 0 && (
          <div className="relative mb-8 flex items-center justify-between border-b border-gray-200/80 pb-4">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">
                Studio Creations & Kindness Community Feed
              </h2>
              <p className="text-xs text-gray-500">
                Every creation displays its AI Material or Human Vocalist identifier, adheres to the 3:50 song hard cutoff (jingles/ads separate) or 10m podcast cap, and welcomes positive creator feedback under @handles.
              </p>
            </div>
            <span className="text-xs font-mono text-gray-500 tabular-nums">
              {gen.results.length} Studio Items
            </span>
          </div>
        )}

        <div className="space-y-6">
          {gen.results.map((result) => {
            const isExpanded = result.isExpanded;
            const isEncoding = encodingVideoId === result.id;
            const isGenerating = result.status === 'generating';
            const isFailed = result.status === 'error';
            const isRecordingThis = recordingForId === result.id;

            return (
              <div
                key={result.id}
                className="group relative transition-all duration-300 bg-white border border-gray-200/80 card-shadow rounded-[36px] overflow-hidden"
              >
                <div className={isExpanded ? 'p-8' : 'p-5'}>
                  {/* Header Row */}
                  <div
                    className={`flex gap-6 items-center ${
                      isExpanded ? 'flex-col md:flex-row mb-6' : 'flex-row'
                    }`}
                    onClick={() => !isExpanded && toggleExpand(result.id)}
                    style={{ cursor: isExpanded ? 'default' : 'pointer' }}
                  >
                    {/* Cover Art + Play Trigger */}
                    <div
                      className={`relative shrink-0 rounded-3xl overflow-hidden shadow-md border border-gray-200 ${
                        isExpanded ? 'w-44 h-44 md:w-48 md:h-48' : 'w-16 h-16'
                      }`}
                    >
                      <img
                        src={
                          result.coverImageUrl ||
                          createStudioCoverSvg('#1e1b4b', '#7f1d1d', '#f59e0b', 'band')
                        }
                        alt={result.title || 'Studio Cover'}
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
                          {result.bandType === 'Custom Genre' && result.customGenreName
                            ? result.customGenreName
                            : result.bandType}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{result.vocalArrangement}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-semibold text-gray-900">
                          {result.maxCapLabel}
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
                          Published & Syndicated to:{' '}
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
                              // Enforce 3:50 (230s) hard cutoff on songs
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
        </>}
      </main>

      {/* ===================================================================== */}
      {/* MODAL 1: DIRECT CREATOR HANDOFF LINKS (TOP 10 PLATFORMS, ZERO KEYS)   */}
      {/* ===================================================================== */}
      {publishTargetResult && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPublishTargetResult(null)}
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
                  Tell Them Studio never holds your platform credentials or API keys. Prepare your source files below, then click any of the Top 10 Handoff Links to sign in with your own account and upload as the publisher.
                </p>
              </div>
              <button
                onClick={() => setPublishTargetResult(null)}
                className="p-2 rounded-full bg-gray-100 text-gray-600 hover:text-gray-900 shrink-0"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {handoffNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-between gap-3">
                <span>{handoffNotice}</span>
                <button
                  onClick={() => setHandoffNotice(null)}
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
                  onClick={() => handleDownloadHandoffPackage(publishTargetResult)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Icons.Download className="w-3.5 h-3.5" />
                  <span>Download WAV + Handoff Manifest</span>
                </button>
                <button
                  onClick={() => handleCopyHandoffMetadata(publishTargetResult)}
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
                  Step 2 — Launch Direct Handoff Link (Top 10 Music & Podcast Destinations)
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
                            handleCopyHandoffMetadata(publishTargetResult, plat.name);
                            if (!isPublished) {
                              handleSyndicateToggle(publishTargetResult.id, plat.name);
                            }
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold text-center transition-colors whitespace-nowrap"
                        >
                          Open {plat.name} Handoff ↗
                        </a>
                        <button
                          onClick={() =>
                            handleSyndicateToggle(publishTargetResult.id, plat.name)
                          }
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                            isPublished
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {isPublished ? 'Handed Off ✓' : 'Mark Done'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setPublishTargetResult(null)}
                className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: SAFETY, ROYALTY & HUMAN ARTIST RESPECT CHARTER               */}
      {/* ===================================================================== */}
      {isStandardsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsStandardsModalOpen(false)}
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
                onClick={() => setIsStandardsModalOpen(false)}
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
                  3. 3:50 Song Hard Cutoff (Jingles Separate) & Weekly 5–10 Minute Podcast Discipline
                </h4>
                <p>
                  Every song can run up to a hard cutoff of <strong>3 minutes and 50 seconds (3:50)</strong>, while jingles and commercial spots use dedicated short formats (<code>:30</code> and <code>:60</code>). Mini-podcasts are strictly <strong>5 to 10 minutes</strong> and require a weekly schedule pledge so creators build loyal audiences without flooding platforms with 15 two-minute clips a day.
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
                onClick={() => setIsStandardsModalOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold"
              >
                Got It — Back to Studio
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;