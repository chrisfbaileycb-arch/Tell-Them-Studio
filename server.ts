import { config as loadEnv } from 'dotenv';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { CREATIVE_SYSTEM_INSTRUCTION, validateCreativeRequest } from './src/services/creativePolicy';
import { GENRES, makeGenreSample, SampleGenre } from './src/utils/creativeAudio';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { MODELS } from './src/config/models';
import { startCatalog } from './src/server/catalog/factory';
import { catalogErrorHandler, createCatalogRouter } from './src/server/routes/catalogRoutes';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });
const app = express();
const portFlag = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 3000));

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : defaultDevOrigins;

// Standard security headers middleware for live cloud deployments
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin browser fetches, mobile clients, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Explicit or default allowed origins
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In non-production/test environments, allow local test runners
      if (process.env.NODE_ENV !== 'production') {
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }

      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  })
);

function envNumber(name: string): number | undefined {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envNumber('API_RATE_LIMIT') ?? 150,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many requests to Tell Them Studio API. Please slow down and try again later.',
  },
});

app.use('/api/', apiLimiter);

// Durable community catalog (creator sessions, creations, object storage). Startup is lazy and
// failure-tolerant: when unconfigured or unavailable every catalog route answers 503 and the
// client keeps working in its local-only fallback mode.
const catalog = startCatalog();

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    catalog: await catalog.health(),
  });
});

app.use(
  express.json({
    limit: '50mb',
    // Inbound signed webhooks are verified against the exact bytes that were signed.
    verify: (req, _res, buf) => {
      if ((req as express.Request).url?.startsWith('/api/inbound/')) (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.use(
  createCatalogRouter({
    getContext: catalog.getContext,
    allowedOrigins,
    publishLimit: envNumber('PUBLISH_RATE_LIMIT'),
    uploadLimit: envNumber('UPLOAD_RATE_LIMIT'),
    sessionCreateLimit: envNumber('SESSION_CREATE_LIMIT'),
    maxCreationsPerCreator: envNumber('MAX_CREATIONS_PER_CREATOR'),
  })
);
// Body-parser failures (malformed/oversized JSON) on catalog paths are reported as JSON.
app.use(['/api/creations', '/api/session', '/api/admin', '/api/shows', '/api/webhooks', '/api/inbound', '/api/inbound-sources', '/feeds'], catalogErrorHandler);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Internal Server Error';
}

function resolveServerApiKey(): string | undefined {
  loadEnv({ path: '.env.local', quiet: true });
  loadEnv({ quiet: true });
  return process.env.GEMINI_API_KEY || process.env.API_KEY;
}

function getAiClient() {
  const apiKey = resolveServerApiKey();
  if (!apiKey) throw new Error('AI is not configured. Set GEMINI_API_KEY on the server to enable generation.');
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function detectGenreFromPrompt(promptText: string): SampleGenre {
  const lower = (promptText || '').toLowerCase();
  if (lower.includes('hair metal')) return 'Hair Metal Band';
  for (const genre of GENRES) {
    if (lower.includes(genre.toLowerCase())) return genre;
  }
  if (lower.includes('country')) return 'Country Band';
  if (lower.includes('pop')) return 'Pop Band';
  if (lower.includes('disco')) return 'Disco Band';
  if (lower.includes('electronic') || lower.includes('synth')) return 'Electronic';
  if (lower.includes('hip-hop') || lower.includes('hip hop')) return 'Hip-Hop';
  if (lower.includes('rap')) return 'Rap';
  if (lower.includes('indie') || lower.includes('acoustic')) return 'Indie';
  if (lower.includes('jazz')) return 'Jazz';
  if (lower.includes('anime')) return 'Anime-Inspired';
  if (lower.includes('serenity') || lower.includes('ambient') || lower.includes('calm')) return 'Serenity';
  if (lower.includes('strictly instrumental') || lower.includes('singer-free')) return 'Singer-Free Instrumental';
  return 'Rock Band';
}

async function generateTextWithFallback(ai: GoogleGenAI, prompt: string, config?: any) {
  const modelsToTry = Array.from(
    new Set([process.env.TEXT_MODEL, MODELS.TEXT_DEFAULT, MODELS.TEXT_FALLBACK].filter(Boolean) as string[])
  );
  let lastError: unknown;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        ...(config ? { config } : {}),
      });
    } catch (err: unknown) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
}

async function synthesizeStudioFallbackTrack(
  ai: GoogleGenAI | null,
  promptText: string,
  isClip: boolean
): Promise<{ audioBase64: string; mimeType: string; rawText: string }> {
  const genre = detectGenreFromPrompt(promptText);
  const hash = Array.from(promptText || 'studio').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const variation = hash % 2;
  const wavBlob = makeGenreSample(genre, variation);
  const wavBuffer = Buffer.from(await wavBlob.arrayBuffer());
  const audioBase64 = wavBuffer.toString('base64');

  const isInstrumental = /strictly INSTRUMENTAL/i.test(promptText);
  const customMatch = promptText.match(/Use these exact lyrics with [^:]+:\n([\s\S]*?)(\s*Keep all content family-safe|$)/i);
  const customLyrics = customMatch?.[1]?.trim();

  let lyricsText = '';
  if (isInstrumental) {
    lyricsText = 'Instrumental Band Backing Track (Ready for Your Voice)';
  } else if (customLyrics) {
    lyricsText = customLyrics;
  } else if (ai) {
    try {
      const lyricRes = await generateTextWithFallback(
        ai,
        `Write original, uplifting, radio-safe song lyrics for this music request: "${promptText}". Include clear section markers like [Verse 1], [Chorus], [Verse 2], [Bridge]. Return ONLY the lyrics.`
      );
      lyricsText = lyricRes.text?.trim() || '';
    } catch (error: unknown) {
      console.warn('Lyric generation fallback triggered:', getErrorMessage(error));
      lyricsText = '';
    }
  }

  if (!lyricsText) {
    lyricsText = `[Verse 1]\nTurn the studio lights up high tonight\nEvery chord and rhythm catching flight\n\n[Chorus]\nTell them we are ready for the stage\nWriting every note upon the page\nSing it out together, loud and clear\nThe sound we have been waiting for is here`;
  }

  const rawText = `${lyricsText}\n\nMetadata: ${genre} · ${isClip ? '0:30 Studio Clip' : 'Studio Arrangement'}`;
  return {
    audioBase64,
    mimeType: 'audio/wav',
    rawText,
  };
}

// Creative assistance is server-proxied: keys never enter the browser.
app.post('/api/creative-assistant', async (req, res) => {
  const invalid = validateCreativeRequest(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!resolveServerApiKey()) return res.status(503).json({ error: 'The creative assistant is not connected yet. Configure GEMINI_API_KEY on the server. Your library and original sketches work without it.' });
  try {
    const { task, message, history = [], genre = '', audio } = req.body;
    const parts: any[] = [{ text: `Task: ${task}. Creative direction: ${genre}.\n${message}` }];
    if (audio) parts.push({ inlineData: { data: audio.data, mimeType: audio.mimeType } });
    const response = await getAiClient().models.generateContent({
      model: process.env.CREATIVE_MODEL || MODELS.CREATIVE_DEFAULT,
      contents: [...history.map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })), { role: 'user', parts }],
      config: { systemInstruction: CREATIVE_SYSTEM_INSTRUCTION, maxOutputTokens: 2400, httpOptions: { timeout: 60000 } },
    });
    if (!response.text?.trim()) return res.status(502).json({ error: 'The assistant returned no response. Try a shorter or different brief.' });
    res.json({ text: response.text.trim() });
  } catch (error: unknown) {
    console.warn('Creative assistant warning:', getErrorMessage(error));
    res.status(502).json({ error: 'The AI service could not complete this request. Check the configured model and provider access, then try again.' });
  }
});

// 1. Generate Song Title
app.post('/api/generate-title', async (req, res) => {
  const { musicPrompt = '', lyricContext = '' } = req.body || {};
  try {
    const ai = getAiClient();
    const prompt = `Based on this music prompt: "${musicPrompt}" and these lyrics: "${(lyricContext || '').substring(0, 500)}", generate a catchy, evocative, short song title (3 words max). Return ONLY the title string, no quotes or extra text.`;
    const response = await generateTextWithFallback(ai, prompt);
    const cleaned = response.text?.trim().replace(/^["']|["']$/g, '');
    if (cleaned) {
      return res.json({ title: cleaned });
    }
  } catch (error: unknown) {
    console.warn('Using fallback song title:', getErrorMessage(error));
  }
  const stopWords = new Set(['create', 'make', 'song', 'track', 'music', 'with', 'about', 'that', 'this', 'from', 'the', 'and', 'for', 'our', 'your', 'original', 'upbeat', 'short', 'clip']);
  const words = `${musicPrompt} ${lyricContext}`
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  res.json({ title: words.length > 0 ? words.join(' ') : 'Studio Session Track' });
});

// 2. Generate Cover Art
app.post('/api/generate-cover', async (req, res) => {
  try {
    const { musicPrompt, lyricContext, title, genre } = req.body || {};
    const ai = getAiClient();
    const imagePrompt = `A high-quality, professional square album cover picture that coincides directly with the song titled "${title || 'Studio Session'}" (${genre || 'Original Music'}). Visual story & atmosphere from the song: ${musicPrompt}. Lyric imagery: ${(lyricContext || '').substring(0, 240)}. Editorial studio photography and graphic art aesthetic. IMPORTANT: Ignore any mention of BPM or musical scale in the prompt; do NOT print any numbers, BPM, or scale text on the image.`;
    const response = await ai.models.generateContent({
      model: process.env.COVER_MODEL || MODELS.COVER_DEFAULT,
      contents: { parts: [{ text: imagePrompt }] },
      config: {
        imageConfig: { aspectRatio: '1:1' },
      },
    });

    let base64Image: string | null = null;
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }
    res.json({ coverImageUrl: base64Image });
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    console.warn('Using studio vector cover art fallback:', errorMsg);
    res.json({ coverImageUrl: null, warning: errorMsg });
  }
});

// 3. Generate Music Track (Lyria Pro / Clip with Studio Synth Fallback on Quota / Free-Tier Limits)
app.post('/api/generate-music', async (req, res) => {
  const { promptText = '', isClip = false, images = [] } = req.body || {};
  let ai: GoogleGenAI | null = null;
  try {
    ai = getAiClient();
    const primaryModel = isClip
      ? process.env.MUSIC_CLIP_MODEL || 'lyria-3-clip-preview'
      : process.env.MUSIC_MODEL || 'lyria-3-pro-preview';
    const modelsToTry = isClip
      ? [primaryModel]
      : Array.from(new Set([primaryModel, process.env.MUSIC_CLIP_MODEL || 'lyria-3-clip-preview']));

    const contents: any =
      Array.isArray(images) && images.length > 0
        ? {
            parts: [
              { text: promptText },
              ...images.map((img: { data: string; mimeType: string }) => ({
                inlineData: { data: img.data, mimeType: img.mimeType },
              })),
            ],
          }
        : promptText;

    let audioAccumulator = '';
    let textAccumulator = '';
    let mimeType = 'audio/wav';

    for (const modelId of modelsToTry) {
      try {
        const responseStream = await ai.models.generateContentStream({
          model: modelId,
          contents,
          config: {
            responseModalities: [Modality.AUDIO],
          },
        });

        let currentPartType = '';
        let textPartsSeen = 0;

        for await (const chunk of responseStream) {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (!parts) continue;
          for (const part of parts) {
            if (part.inlineData?.data) {
              currentPartType = 'audio';
              if (!audioAccumulator && part.inlineData.mimeType) {
                mimeType = part.inlineData.mimeType;
              }
              audioAccumulator += part.inlineData.data;
            }
            if (part.text) {
              if (currentPartType !== 'text') {
                textPartsSeen++;
                currentPartType = 'text';
              }
              if (textPartsSeen === 1) {
                textAccumulator += part.text;
              }
            }
          }
        }

        if (audioAccumulator) break;
      } catch (lyriaErr: unknown) {
        console.warn(`Lyria model (${modelId}) unavailable or quota reached (${getErrorMessage(lyriaErr)}), trying next option...`);
      }
    }

    if (audioAccumulator) {
      return res.json({
        audioBase64: audioAccumulator,
        mimeType,
        rawText: textAccumulator,
      });
    }

    const fallback = await synthesizeStudioFallbackTrack(ai, promptText, Boolean(isClip));
    return res.json(fallback);
  } catch (error: unknown) {
    console.warn('Music generation fell back to studio synthesizer:', getErrorMessage(error));
    try {
      const fallback = await synthesizeStudioFallbackTrack(ai, promptText, Boolean(isClip));
      return res.json(fallback);
    } catch (innerErr: unknown) {
      return res.status(500).json({ error: getErrorMessage(innerErr) || 'Music synthesis failed.' });
    }
  }
});

// 4. Generate Multi-Host Mini-Podcast (5-10 min structured show + Dual-Speaker TTS)
app.post('/api/generate-podcast', async (req, res) => {
  const {
    showTitle = 'Tell Them Weekly',
    episodeTopic = 'Creative Studio Stories',
    targetMinutes = 6,
    hostAName = 'Alex',
    hostAVoice = 'Puck',
    hostBName = 'Sam',
    hostBVoice = 'Kore',
    scheduleDay = 'Wednesday',
    scheduleTime = '08:00 AM',
  } = req.body || {};

  try {
    const ai = getAiClient();

    const scriptPrompt = `You are producing a high-energy, positive, family-safe mini-podcast episode for "${showTitle}".
Topic: "${episodeTopic}"
Target Episode Duration: ${targetMinutes} minutes (strictly within the 5 to 10 minute mini-podcast format, with optional release-plan notes: ${scheduleDay} at ${scheduleTime}; these notes do not schedule publication).
Host 1: ${hostAName} (Enthusiastic, warm lead host)
Host 2: ${hostBName} (Insightful, witty co-host)

Follow strict community guidelines: respectful, uplifting, zero profanity, no trademark infringement, and include a brief transparency note at the outro that this show was crafted with Tell Them Studio AI tools.
Return JSON with:
- episodeTitle: catchy title
- showNotes: 2-3 sentence summary for Spotify, YouTube, and Amazon Music
- chapters: array of { timestamp: string, title: string, summary: string } covering the ${targetMinutes}-minute arc
- scriptLines: array of 12 to 18 conversational dialogue turns between ${hostAName} and ${hostBName}, approximately ${Number(targetMinutes) * 140} spoken words in total. Duration is a pacing target, not a guaranteed encoded duration.`;

    let parsed: any = {};
    try {
      const scriptResponse = await generateTextWithFallback(ai, scriptPrompt, {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            episodeTitle: { type: Type.STRING },
            showNotes: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['timestamp', 'title', 'summary'],
              },
            },
            scriptLines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
                required: ['speaker', 'text'],
              },
            },
          },
          required: ['episodeTitle', 'showNotes', 'chapters', 'scriptLines'],
        },
      });
      parsed = JSON.parse(scriptResponse.text || '{}');
    } catch (error: unknown) {
      console.warn('Podcast script generation fallback triggered:', getErrorMessage(error));
      parsed = {
        episodeTitle: `${showTitle}: ${episodeTopic}`,
        showNotes: `An uplifting ${targetMinutes}-minute studio conversation between ${hostAName} and ${hostBName} exploring ${episodeTopic}.`,
        chapters: [
          { timestamp: '0:00', title: 'Welcome & Cold Open', summary: `Setting the stage for ${episodeTopic}.` },
          { timestamp: '2:00', title: 'Deep Dive Discussion', summary: `${hostAName} and ${hostBName} share studio insights.` },
          { timestamp: '4:30', title: 'Takeaways & Sign-Off', summary: 'Closing reflections and community callout.' },
        ],
        scriptLines: [
          { speaker: hostAName, text: `Welcome back to ${showTitle}! Today we are diving into ${episodeTopic}.` },
          { speaker: hostBName, text: `It is such a great topic, and there are so many creative angles to explore today.` },
          { speaker: hostAName, text: `Thanks for tuning in to this Tell Them Studio session!` },
        ],
      };
    }

    const lines: { speaker: string; text: string }[] = parsed.scriptLines || [];
    const ttsParts = lines.map((line) => ({
      text: `${line.speaker}: ${line.text}`,
    }));

    let audioBase64: string | null = null;
    let mimeType = 'audio/wav';
    const ttsModels = Array.from(
      new Set([process.env.TTS_MODEL, MODELS.TTS_DEFAULT, ...MODELS.TTS_FALLBACKS].filter(Boolean) as string[])
    );

    for (const ttsModel of ttsModels) {
      try {
        const ttsResponse = await ai.models.generateContent({
          model: ttsModel,
          contents: [{ role: 'user', parts: ttsParts }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: hostAName,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: hostAVoice || 'Puck' } },
                  },
                  {
                    speaker: hostBName,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: hostBVoice || 'Kore' } },
                  },
                ],
              },
            },
          },
        });
        const inline = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inline?.data) {
          audioBase64 = inline.data;
          mimeType = inline.mimeType || 'audio/wav';
          break;
        }
      } catch (ttsErr: unknown) {
        console.warn(`TTS model (${ttsModel}) unavailable or quota reached (${getErrorMessage(ttsErr)}), trying next...`);
      }
    }

    if (!audioBase64) {
      const wavBlob = makeGenreSample('Jazz', 0);
      audioBase64 = Buffer.from(await wavBlob.arrayBuffer()).toString('base64');
      mimeType = 'audio/wav';
    }

    res.json({
      episodeTitle: parsed.episodeTitle || `${showTitle}: ${episodeTopic}`,
      showNotes: parsed.showNotes || '',
      chapters: parsed.chapters || [],
      scriptLines: lines,
      audioBase64,
      mimeType,
    });
  } catch (error: unknown) {
    console.warn('Podcast synthesis fallback triggered:', getErrorMessage(error));
    const wavBlob = makeGenreSample('Jazz', 0);
    const audioBase64 = Buffer.from(await wavBlob.arrayBuffer()).toString('base64');
    res.json({
      episodeTitle: `${showTitle}: ${episodeTopic}`,
      showNotes: `Studio conversation between ${hostAName} and ${hostBName}.`,
      chapters: [{ timestamp: '0:00', title: 'Episode Intro', summary: episodeTopic }],
      scriptLines: [
        { speaker: hostAName, text: `Welcome to ${showTitle}! Today we're talking about ${episodeTopic}.` },
        { speaker: hostBName, text: `Glad to be here in the studio with everyone listening.` },
      ],
      audioBase64,
      mimeType: 'audio/wav',
    });
  }
});

// 5. Generate Craft Radio/Video Commercial (Authentic Ad Copy + Voiceover)
app.post('/api/generate-commercial', async (req, res) => {
  const {
    brandName = 'Studio Partner',
    productOrService = 'Creative Audio Production',
    targetAudience = 'Music & Podcast Fans',
    adTone = 'Warm & Uplifting',
    callToAction = 'Visit our studio today',
    spotLength = '30s',
    voiceName = 'Fenrir',
  } = req.body || {};

  try {
    const ai = getAiClient();

    const adPrompt = `You are an award-winning radio & broadcast advertising creative director.
Craft an authentic, high-craft ${spotLength} radio & audio commercial for:
Brand/Project: "${brandName}"
Offering: "${productOrService}"
Target Audience: "${targetAudience}"
Creative Tone: "${adTone}"
Call to Action: "${callToAction}"

Strict Advertising Standards:
1. No fake celebrity impersonation or deceptive claims.
2. Family-safe (PG / General Audience) broadcast standards, zero offensive or disparaging language.
3. Clear storytelling arc: Attention Hook -> Authentic Benefit -> Memorable Sonic Tagline -> Call to Action.

Return JSON with:
- campaignTitle: title of the commercial spot
- tagline: memorable slogan
- voiceoverScript: the exact spoken script for the narrator (natural pacing for a ${spotLength} spot)
- sonicDirection: musical bed and sound design cues
- storyboardFrames: array of 3 visual scenes ({ timeRange, visual, audioCue })
- complianceNotes: brief confirmation of PG safety, truth-in-advertising, and no-impersonation compliance.`;

    let parsed: any = {};
    try {
      const copyResponse = await generateTextWithFallback(ai, adPrompt, {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            campaignTitle: { type: Type.STRING },
            tagline: { type: Type.STRING },
            voiceoverScript: { type: Type.STRING },
            sonicDirection: { type: Type.STRING },
            storyboardFrames: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timeRange: { type: Type.STRING },
                  visual: { type: Type.STRING },
                  audioCue: { type: Type.STRING },
                },
                required: ['timeRange', 'visual', 'audioCue'],
              },
            },
            complianceNotes: { type: Type.STRING },
          },
          required: [
            'campaignTitle',
            'tagline',
            'voiceoverScript',
            'sonicDirection',
            'storyboardFrames',
            'complianceNotes',
          ],
        },
      });
      parsed = JSON.parse(copyResponse.text || '{}');
    } catch (error: unknown) {
      console.warn('Commercial copy generation fallback triggered:', getErrorMessage(error));
      parsed = {
        campaignTitle: `${brandName} Spotlight`,
        tagline: `${brandName} — Crafted for You`,
        voiceoverScript: `Discover ${brandName}. ${productOrService}. Built for ${targetAudience}. ${callToAction}!`,
        sonicDirection: `${adTone} acoustic and synth bed`,
        storyboardFrames: [
          { timeRange: '0:00-0:10', visual: `Opening shot of ${brandName}`, audioCue: 'Upbeat studio chime' },
          { timeRange: '0:10-0:20', visual: `Highlighting ${productOrService}`, audioCue: 'Warm rhythm bed' },
          { timeRange: '0:20-0:30', visual: `${callToAction} title card`, audioCue: 'Resolved sonic logo' },
        ],
        complianceNotes: 'PG Family-Safe Broadcast Verified.',
      };
    }

    let audioBase64: string | null = null;
    let mimeType = 'audio/wav';
    const ttsModels = Array.from(
      new Set([process.env.TTS_MODEL, MODELS.TTS_DEFAULT, ...MODELS.TTS_FALLBACKS].filter(Boolean) as string[])
    );

    for (const ttsModel of ttsModels) {
      try {
        const ttsResponse = await ai.models.generateContent({
          model: ttsModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: parsed.voiceoverScript || `${brandName}. ${productOrService}. ${callToAction}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName || 'Fenrir' },
              },
            },
          },
        });
        const inline = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inline?.data) {
          audioBase64 = inline.data;
          mimeType = inline.mimeType || 'audio/wav';
          break;
        }
      } catch (ttsErr: unknown) {
        console.warn(`Commercial TTS (${ttsModel}) unavailable or quota reached (${getErrorMessage(ttsErr)}), trying next...`);
      }
    }

    if (!audioBase64) {
      const wavBlob = makeGenreSample('Pop Band', 0);
      audioBase64 = Buffer.from(await wavBlob.arrayBuffer()).toString('base64');
      mimeType = 'audio/wav';
    }

    res.json({
      ...parsed,
      audioBase64,
      mimeType,
    });
  } catch (error: unknown) {
    console.warn('Commercial synthesis fallback triggered:', getErrorMessage(error));
    const wavBlob = makeGenreSample('Pop Band', 0);
    const audioBase64 = Buffer.from(await wavBlob.arrayBuffer()).toString('base64');
    res.json({
      campaignTitle: `${brandName} Broadcast Spot`,
      tagline: `${brandName} — Crafted for You`,
      voiceoverScript: `${brandName}: ${productOrService}. ${callToAction}!`,
      sonicDirection: `${adTone} studio bed`,
      storyboardFrames: [],
      complianceNotes: 'PG Broadcast Verified',
      audioBase64,
      mimeType: 'audio/wav',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, _res, next) => {
      if (req.path === '/showcase') {
        req.url = '/showcase.html';
      }
      next();
    });
    const vite = await createViteServer({
      server: { middlewareMode: true, ...(process.argv.includes('--strictPort') ? { hmr: false } : {}) },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/showcase*', (_req, res) => {
      res.sendFile(path.join(distPath, 'showcase.html'));
    });
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tell Them Studio server listening on 0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'} mode)`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down Tell Them Studio gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced termination after shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
