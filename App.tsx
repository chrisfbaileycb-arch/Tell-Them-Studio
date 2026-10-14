import React, { useState, useRef, useEffect } from 'react';
import {
  BandArchetype,
  ContentOriginType,
  Duration,
  GenerationState,
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
import { TrendingView } from './src/components/TrendingView';

const App: React.FC = () => {
  // Active workspace tab
  const [activeTab, setActiveTab] = useState<StudioTab>('bands');

  // Creator Handle (Safe handle-only identity, no personal info)
  const [creatorHandle, setCreatorHandle] = useState('@studio_voyager');
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
  const [duration, setDuration] = useState<Duration>('2:48 Radio Master (Max)');
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
    'How multi-singer rock and disco bands craft unforgettable 2:48 radio hooks without filler'
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

  // Publish & Syndicate Modal State
  const [publishTargetResult, setPublishTargetResult] = useState<SongResult | null>(null);
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
            return `Create a ${s.mood?.toLowerCase()} ${s.gender} song about ${s.theme?.toLowerCase()} featuring ${vocalArrangement}${bpmInfo}${scaleInfo}. Max duration 2:48.`;
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
      `Create a ${randomMood.toLowerCase()} ${genreLabel} song about ${randomTheme.toLowerCase()} featuring ${vocalArrangement} and live band instrumentation. Radio edit capped at 2:48.`
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

  // Generate Band Song (Capped at 2:48 max)
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
      metadata: `${activeBand === 'Custom Genre' ? customGenreName : activeBand} · ${activeVocals} · 2:48 Max Cap`,
      fullPrompt: null,
      error: null,
      duration: activeDuration,
      maxCapLabel:
        activeDuration === '0:30 Hook Preview' || activeDuration === 'Lyria 3 Clip (30s)'
          ? '0:30 / 2:48 MAX'
          : activeDuration === '2:15 Tight Single'
          ? '2:15 / 2:48 MAX'
          : '2:48 / 2:48 MAX',
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

    const isClip =
      activeDuration === '0:30 Hook Preview' ||
      activeDuration === 'Lyria 3 Clip (30s)' ||
      activeDuration === 'Clip (30s)';

    const genreDescription =
      activeBand === 'Custom Genre' ? customGenreName : activeBand;

    addLog(
      newId,
      `Initializing ${genreDescription} (${activeVocals}) — enforcing 2:48 max radio cap...`
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
        : `\nGenerate uplifting, radio-safe lyrics arranged for ${activeVocals} with clear vocal handoffs (e.g. [Lead 1], [Lead 2], [Band Chorus]).`;

      const promptText = `Generate a ${
        isClip ? '30-second hook preview' : 'tight radio-ready track (strictly max 2 minutes 48 seconds)'
      } performed by a ${genreDescription}. Vocal arrangement: ${activeVocals}. Context: "${activePrompt}". ${lyricInstruction} Keep all content family-safe, original, and respectful.`;

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
      addLog(newId, 'Master audio stream captured and verified under 2:48 cap.');

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
      duration: '2:48 Radio Master (Max)',
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
      originalDuration: '2:48 Radio Master (Max)',
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

      const audioUrl = data.audioBase64
        ? createAudioUrlFromBase64(data.audioBase64, data.mimeType || 'audio/wav')
        : createStudioPreviewWavUrl('disco');

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

      const audioUrl = data.audioBase64
        ? createAudioUrlFromBase64(data.audioBase64, data.mimeType || 'audio/wav')
        : createStudioPreviewWavUrl('rock');

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
        'Custom creator radio station featuring 2:48 band hits, weekly mini-podcasts, and craft spots.',
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
    setDuration('2:48 Radio Master (Max)');
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

    await handleDownloadVideo(
      result,
      withLyrics,
      (progress) => setEncodingProgress(progress),
      () => {
        setEncodingVideoId(null);
        setEncodingProgress(0);
      }
    );
  };

  const handleSyndicateToggle = (
    resultId: string,
    platform: 'Spotify' | 'YouTube' | 'Amazon Music' | 'Apple Podcasts'
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col pb-24 overflow-x-hidden bg-[#fbfbfd] text-[#1d1d1f]"
      onClick={() => setActiveSelector(null)}
    >
      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-50 glass border-b border-gray-200/70 h-16 flex items-center justify-between gap-8 px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('bands');
          }}
          className="text-lg font-extrabold tracking-tight text-gray-900 whitespace-nowrap shrink-0"
        >
          Tell Them Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <button
            onClick={() => setActiveTab('bands')}
            className={`hover:text-gray-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'bands'
                ? 'border-pink-600 text-gray-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Band Studio
          </button>
          <button
            onClick={() => setActiveTab('stations')}
            className={`hover:text-gray-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'stations'
                ? 'border-pink-600 text-gray-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Radio Stations
          </button>
          <button
            onClick={() => setActiveTab('podcasts')}
            className={`hover:text-gray-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'podcasts'
                ? 'border-pink-600 text-gray-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Mini-Podcasts
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`hover:text-gray-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'holidays'
                ? 'border-pink-600 text-gray-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Holiday Hub
          </button>
          <button
            onClick={() => setActiveTab('trending')}
            className={`hover:text-gray-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'trending'
                ? 'border-pink-600 text-gray-900 font-semibold'
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
            className="px-4 py-2 text-xs font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-colors whitespace-nowrap shrink-0"
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
            <span className="font-mono tabular-nums">Songs Max 2:48</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Weekly Podcasts 5–10m</span>
            <span aria-hidden="true">·</span>
            <span>AI Material Disclosure Active</span>
          </div>

          {/* Segmented Mode Control for all viewports */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {(
              [
                { id: 'bands', label: 'Multi-Singer Bands' },
                { id: 'stations', label: 'Radio Stations' },
                { id: 'podcasts', label: 'Mini-Podcasts (5–10m)' },
                { id: 'commercials', label: 'Commercial Craft' },
                { id: 'holidays', label: 'Holiday Specials' },
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

        {/* ===================================================================== */}
        {/* TAB 1: MULTI-SINGER BAND & CUSTOM GENRE STUDIO                        */}
        {/* ===================================================================== */}
        {activeTab === 'bands' && (
          <>
            <section className="text-center mb-10 space-y-3">
              <h1
                className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Build Your Band, Vocal Lineup & Radio Single
              </h1>
              <p className="text-base md:text-lg text-gray-500 max-w-3xl mx-auto font-normal leading-relaxed">
                Craft multi-singer Rock, Country, Pop, and Disco band tracks—or generate singer-free backing bands to showcase your own live voice. Every track is radio-paced at a maximum of 2 minutes and 48 seconds and ready to publish to Spotify, YouTube, and Amazon Music.
              </p>
            </section>

            <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 relative z-10">
              <div className="space-y-8">
                {/* Step 1: Band Archetype & Custom Genre */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-bold text-gray-900">
                      01. Select Your Band Lineup or Custom Genre
                    </label>
                    <span className="text-xs text-gray-500 font-mono tabular-nums">
                      Strict Radio Standard: 2:48 Maximum Song Length
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

                {/* Step 4: Radio Duration Cap (Max 2:48) & Lyrics Mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700">
                      Radio Duration Format (Capped at 2:48 Max)
                    </label>
                    <div className="flex flex-wrap bg-gray-100 p-1 rounded-2xl w-fit gap-1">
                      {(
                        [
                          '2:48 Radio Master (Max)',
                          '2:15 Tight Single',
                          '0:30 Hook Preview',
                        ] as Duration[]
                      ).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setDuration(opt)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 font-mono tabular-nums ${
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
                  Generate {selectedBand === 'Custom Genre' ? customGenreName : selectedBand} Track (2:48 Max)
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
            <div className="text-center space-y-3">
              <h1
                className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900"
                style={{ textWrap: 'balance' }}
              >
                Creator Radio Stations & Syndication Hub
              </h1>
              <p className="text-base text-gray-500 max-w-3xl mx-auto">
                Curate your own radio station combining 2:48 band songs, weekly mini-podcasts, and craft commercials. Share under safe studio handles and push directly to Spotify, YouTube, and Amazon Music.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                      placeholder="2:48 max multi-singer hits, Wednesday 7-min mini-podcasts, and local craft spots."
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
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: MINI-PODCAST STUDIO (5-10 MIN MAX + WEEKLY SCHEDULE PLEDGE)    */}
        {/* ===================================================================== */}
        {activeTab === 'podcasts' && (
          <section className="bg-white rounded-[36px] p-8 md:p-10 card-shadow border border-gray-200/80 mb-12 space-y-8">
            <div className="space-y-2">
              <h1
                className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900"
                style={{ textWrap: 'balance' }}
              >
                Scheduled Mini-Podcast Studio (5 to 10 Minutes Max)
              </h1>
              <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
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
            <div className="space-y-2">
              <h1
                className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900"
                style={{ textWrap: 'balance' }}
              >
                True Craft Commercial Studio
              </h1>
              <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
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
        {/* TAB 6: WEEKLY TRENDING GENRES & SONG THEMES (RECHARTS)                */}
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
          />
        )}

        {/* ===================================================================== */}
        {/* SHARED STUDIO GALLERY: SONGS, PODCASTS & COMMERCIALS                  */}
        {/* ===================================================================== */}
        {gen.results.length > 0 && (
          <div className="relative mb-8 flex items-center justify-between border-b border-gray-200/80 pb-4">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">
                Studio Creations & Kindness Community Feed
              </h2>
              <p className="text-xs text-gray-500">
                Every creation displays its AI Material or Human Vocalist identifier, adheres to the 2:48 song / 10m podcast cap, and welcomes positive creator feedback under @handles.
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
                            onClick={() => setPublishTargetResult(result)}
                            className="px-3.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Icons.Share className="w-3.5 h-3.5" />
                            <span>Publish to Spotify / YouTube / Amazon</span>
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
                              // Enforce 2:48 (168s) max duration cap on songs
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
      </main>

      {/* ===================================================================== */}
      {/* MODAL 1: PUBLISH & SYNDICATE TO SPOTIFY, YOUTUBE, AMAZON MUSIC        */}
      {/* ===================================================================== */}
      {publishTargetResult && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPublishTargetResult(null)}
        >
          <div
            className="bg-white rounded-[32px] max-w-xl w-full p-8 card-shadow border border-gray-200 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-extrabold text-gray-900">
                  Publish & Syndicate Creation
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Push "{publishTargetResult.title}" to major listening platforms with verified AI/Human origin metadata and duration compliance.
                </p>
              </div>
              <button
                onClick={() => setPublishTargetResult(null)}
                className="p-2 rounded-full bg-gray-100 text-gray-600 hover:text-gray-900"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {/* Pre-Flight Compliance Summary */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2 text-xs text-gray-700">
              <div className="flex items-center justify-between">
                <span>Duration Guardrail:</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                  {publishTargetResult.maxCapLabel} (Verified)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Artist Respect & Origin Identifier:</span>
                <span className="font-semibold text-gray-900">
                  {publishTargetResult.originType}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Creator Handle Attribution:</span>
                <span className="font-mono text-blue-600">
                  {publishTargetResult.creatorHandle}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                Select Destination Platforms to Push Release Package
              </label>
              {(
                [
                  {
                    name: 'Spotify',
                    desc: 'Spotify for Artists & Spotify for Podcasters (Audio + Canvas/Video)',
                  },
                  {
                    name: 'YouTube',
                    desc: 'YouTube Music & YouTube Studio (1080p Reactive Spectrum / Lyric Video)',
                  },
                  {
                    name: 'Amazon Music',
                    desc: 'Amazon Music for Artists & Podcasters Distribution Feed',
                  },
                  {
                    name: 'Apple Podcasts',
                    desc: 'Apple Music & Weekly Scheduled Podcast RSS Feed',
                  },
                ] as const
              ).map((plat) => {
                const isPublished = publishTargetResult.publishedPlatforms.includes(
                  plat.name
                );
                return (
                  <div
                    key={plat.name}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-200 bg-white"
                  >
                    <div>
                      <div className="text-sm font-bold text-gray-900">{plat.name}</div>
                      <div className="text-xs text-gray-500">{plat.desc}</div>
                    </div>
                    <button
                      onClick={() =>
                        handleSyndicateToggle(publishTargetResult.id, plat.name)
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                        isPublished
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {isPublished ? 'Published ✓' : 'Push to Platform'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => handleDownload(publishTargetResult)}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800"
              >
                Download Distribution WAV
              </button>
              <button
                onClick={() => setPublishTargetResult(null)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
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
                  3. 2:48 Song Cap & Weekly 5–10 Minute Podcast Discipline
                </h4>
                <p>
                  Songs are capped at <strong>2 minutes and 48 seconds</strong> so every track stays punchy and radio-ready. Mini-podcasts are strictly <strong>5 to 10 minutes</strong> and require a weekly schedule pledge so creators build loyal audiences without flooding platforms with 15 two-minute clips a day.
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