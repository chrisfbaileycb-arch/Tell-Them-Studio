/**
 * Centralized Model Registry for Tell Them Studio
 *
 * Defines canonical Gemini and Lyria model identifiers and their fallback chains.
 */
export const MODELS = {
  MUSIC_FULL: 'lyria-3-pro-preview',
  MUSIC_CLIP: 'lyria-3-clip-preview',
  TEXT_DEFAULT: 'gemini-3.8-flash',
  TEXT_FALLBACK: 'gemini-2.5-flash',
  CREATIVE_DEFAULT: 'gemini-3.8-flash',
  COVER_DEFAULT: 'gemini-3.1-flash-lite-image',
  TTS_DEFAULT: 'gemini-3.8-flash-tts',
  TTS_FALLBACKS: [
    'gemini-3.8-flash-lite-tts',
    'gemini-3.8-flash-tts',
    'gemini-2.5-flash-preview-tts',
  ],
} as const;
