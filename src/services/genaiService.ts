/**
 * GenAI Client Service (Server-Side Proxy Client)
 *
 * Communicates with the Express backend (/api/*) so all @google/genai calls
 * happen strictly on the server.
 */
import { logFunctionCall } from '../utils/logger';
import { createStudioCoverSvg } from '../../constants';

export const parseModelOutput = (text: string): { lyrics: string; metadata: string } => {
  logFunctionCall('parseModelOutput', { textLength: text.length });
  const metaMarkers = /Caption:|Instruments:|Metadata:|Structure:|Description:|Mood:|mosic:|bpm:/i;
  const match = text.search(metaMarkers);
  if (match !== -1) {
    return {
      lyrics: text.substring(0, match).trim(),
      metadata: text.substring(match).trim(),
    };
  }
  return { lyrics: text, metadata: '' };
};

export const generateSongTitle = async (
  musicPrompt: string,
  lyricContext: string
): Promise<string> => {
  logFunctionCall('generateSongTitle', { musicPrompt, lyricContextLength: lyricContext.length });
  try {
    const res = await fetch('/api/generate-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musicPrompt, lyricContext }),
    });
    if (!res.ok) throw new Error('Title API failed');
    const data = await res.json();
    return data.title || 'Untitled Band Track';
  } catch (err) {
    console.error('Failed to generate title:', err);
    return 'Studio Band Track';
  }
};

export const generateCoverArt = async (
  musicPrompt: string,
  lyricContext: string,
  title?: string,
  motif: 'band' | 'podcast' | 'commercial' | 'halloween' | 'christmas' | 'radio' = 'band'
): Promise<string> => {
  logFunctionCall('generateCoverArt', { musicPrompt, lyricContextLength: lyricContext.length, title });
  try {
    const res = await fetch('/api/generate-cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musicPrompt, lyricContext, title }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.coverImageUrl) return data.coverImageUrl;
    }
  } catch (imgErr) {
    console.warn('Falling back to studio vector artwork:', imgErr);
  }
  // Zero-broken-image guaranteed fallback SVG cover art
  const palettes: [string, string, string][] = [
    ['#1e1b4b', '#7f1d1d', '#f59e0b'],
    ['#0f172a', '#1e3a8a', '#38bdf8'],
    ['#3b0764', '#9d174d', '#f472b6'],
    ['#064e3b', '#115e59', '#34d399'],
  ];
  const pick = palettes[Math.abs((title || musicPrompt).length) % palettes.length];
  return createStudioCoverSvg(pick[0], pick[1], pick[2], motif);
};

export const requestMusicGeneration = async (params: {
  promptText: string;
  isClip: boolean;
  images: { data: string; mimeType: string }[];
}): Promise<{ audioBase64: string; mimeType: string; rawText: string }> => {
  const res = await fetch('/api/generate-music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Music generation failed');
  }
  return data;
};

export const requestPodcastGeneration = async (params: {
  showTitle: string;
  episodeTopic: string;
  targetMinutes: number;
  hostAName: string;
  hostAVoice: string;
  hostBName: string;
  hostBVoice: string;
  scheduleDay: string;
  scheduleTime: string;
}) => {
  const res = await fetch('/api/generate-podcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Podcast generation failed');
  }
  return data;
};

export const requestCommercialGeneration = async (params: {
  brandName: string;
  productOrService: string;
  targetAudience: string;
  adTone: string;
  callToAction: string;
  spotLength: '30s' | '60s';
  voiceName: string;
}) => {
  const res = await fetch('/api/generate-commercial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Commercial generation failed');
  }
  return data;
};
