/**
 * GenAI Client Service (Server-Side Proxy Client)
 *
 * Communicates with the Express backend (/api/*) so all @google/genai calls
 * happen strictly on the server.
 */
import { logFunctionCall } from '../utils/logger';
import { createUniqueSongArtworkSvg } from '../../constants';

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
  motif: 'band' | 'podcast' | 'commercial' | 'halloween' | 'christmas' | 'radio' = 'band',
  genre?: string,
  creatorHandle?: string,
  seed?: string | number
): Promise<string> => {
  logFunctionCall('generateCoverArt', { musicPrompt, lyricContextLength: lyricContext.length, title });
  try {
    const res = await fetch('/api/generate-cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musicPrompt, lyricContext, title, genre }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.coverImageUrl) return data.coverImageUrl;
    }
  } catch (imgErr) {
    console.warn('Falling back to unique song vector artwork:', imgErr);
  }
  // Unique song-coinciding vector artwork tailored to title, genre, prompt, and lyrics
  return createUniqueSongArtworkSvg({
    title: title || 'Original Studio Track',
    genre: genre || (motif === 'podcast' ? 'Podcast' : motif === 'commercial' ? 'Broadcast Spot' : 'Studio Band'),
    prompt: musicPrompt,
    lyrics: lyricContext,
    creatorHandle: creatorHandle || '@studio_voyager',
    seed: seed ?? `${title || ''}-${musicPrompt}`,
    motif,
  });
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
