import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Generate Song Title
app.post('/api/generate-title', async (req, res) => {
  try {
    const { musicPrompt, lyricContext } = req.body;
    const ai = getAiClient();
    const prompt = `Based on this music prompt: "${musicPrompt}" and these lyrics: "${(lyricContext || '').substring(0, 500)}", generate a catchy, evocative, short song title (3 words max). Return ONLY the title string, no quotes or extra text.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });
    res.json({ title: response.text?.trim() || 'Untitled Studio Track' });
  } catch (error: any) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: error.message || 'Failed to generate title', title: 'Studio Track' });
  }
});

// 2. Generate Cover Art
app.post('/api/generate-cover', async (req, res) => {
  try {
    const { musicPrompt, lyricContext, title } = req.body;
    const ai = getAiClient();
    const imagePrompt = `A high-quality, professional square album cover for a radio-ready track titled "${title || 'Studio Session'}". Atmosphere: ${musicPrompt}. Context: ${(lyricContext || '').substring(0, 200)}. Editorial studio photography and graphic art aesthetic. IMPORTANT: Ignore any mention of BPM or musical scale in the prompt; do NOT print any numbers, BPM, or scale text on the image.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
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
  } catch (error: any) {
    console.error('Error generating cover art:', error);
    res.json({ coverImageUrl: null, warning: error.message });
  }
});

// 3. Generate Music Track (Lyria Pro / Clip)
app.post('/api/generate-music', async (req, res) => {
  try {
    const { promptText, isClip, images } = req.body;
    const ai = getAiClient();
    const modelId = isClip ? 'lyria-3-clip-preview' : 'lyria-3-pro-preview';

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

    const responseStream = await ai.models.generateContentStream({
      model: modelId,
      contents,
      config: {
        responseModalities: [Modality.AUDIO],
      },
    });

    let audioAccumulator = '';
    let textAccumulator = '';
    let mimeType = 'audio/wav';
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

    if (!audioAccumulator) {
      return res.status(500).json({ error: 'No audio stream returned from Lyria model.' });
    }

    res.json({
      audioBase64: audioAccumulator,
      mimeType,
      rawText: textAccumulator,
    });
  } catch (error: any) {
    console.error('Error generating music:', error);
    res.status(500).json({ error: error.message || 'Music synthesis failed.' });
  }
});

// 4. Generate Multi-Host Mini-Podcast (5-10 min structured show + Dual-Speaker TTS)
app.post('/api/generate-podcast', async (req, res) => {
  try {
    const {
      showTitle,
      episodeTopic,
      targetMinutes,
      hostAName,
      hostAVoice,
      hostBName,
      hostBVoice,
      scheduleDay,
      scheduleTime,
    } = req.body;

    const ai = getAiClient();

    // First generate a rich, structured radio-ready podcast script & show notes
    const scriptPrompt = `You are producing a high-energy, positive, family-safe mini-podcast episode for "${showTitle}".
Topic: "${episodeTopic}"
Target Episode Duration: ${targetMinutes} minutes (strictly within the 5 to 10 minute mini-podcast format, scheduled weekly on ${scheduleDay} at ${scheduleTime}).
Host 1: ${hostAName} (Enthusiastic, warm lead host)
Host 2: ${hostBName} (Insightful, witty co-host)

Follow strict community guidelines: respectful, uplifting, zero profanity, no trademark infringement, and include a brief transparency note at the outro that this show was crafted with Tell Them Studio AI tools.
Return JSON with:
- episodeTitle: catchy title
- showNotes: 2-3 sentence summary for Spotify, YouTube, and Amazon Music
- chapters: array of { timestamp: string, title: string, summary: string } covering the ${targetMinutes}-minute arc
- scriptLines: array of 8 to 10 rich conversational dialogue turns between ${hostAName} and ${hostBName} with natural podcast energy.`;

    const scriptResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: scriptPrompt,
      config: {
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
      },
    });

    const parsed = JSON.parse(scriptResponse.text || '{}');
    const lines: { speaker: string; text: string }[] = parsed.scriptLines || [];

    // Synthesize multi-speaker audio using gemini-3.8-flash-tts
    const ttsParts = lines.map((line) => ({
      text: `${line.speaker}: ${line.text}`,
      speechMetadata: {
        speaker: line.speaker === hostBName ? hostBName : hostAName,
        style: line.speaker === hostBName ? 'Curious, articulate podcast co-host' : 'Enthusiastic, warm radio podcast host',
      },
    }));

    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: ttsParts,
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: hostAName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: hostAVoice || 'Puck' },
                },
              },
              {
                speaker: hostBName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: hostBVoice || 'Kore' },
                },
              },
            ],
          },
        },
      },
    });

    const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;

    res.json({
      episodeTitle: parsed.episodeTitle || `${showTitle}: ${episodeTopic}`,
      showNotes: parsed.showNotes || '',
      chapters: parsed.chapters || [],
      scriptLines: lines,
      audioBase64,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('Error generating podcast:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize mini-podcast.' });
  }
});

// 5. Generate Craft Radio/Video Commercial (Authentic Ad Copy + Voiceover)
app.post('/api/generate-commercial', async (req, res) => {
  try {
    const {
      brandName,
      productOrService,
      targetAudience,
      adTone,
      callToAction,
      spotLength,
      voiceName,
    } = req.body;

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

    const copyResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: adPrompt,
      config: {
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
      },
    });

    const parsed = JSON.parse(copyResponse.text || '{}');

    // Synthesize commercial voiceover with gemini-3.8-flash-lite-tts
    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: parsed.voiceoverScript || `${brandName}. ${productOrService}. ${callToAction}`,
              speechMetadata: {
                style: `Warm, articulate, professional broadcast commercial voiceover (${adTone})`,
              },
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

    const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;

    res.json({
      ...parsed,
      audioBase64,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('Error generating commercial:', error);
    res.status(500).json({ error: error.message || 'Failed to generate commercial spot.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tell Them Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
