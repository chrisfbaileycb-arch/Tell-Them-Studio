/**
 * Configuration Module for Tell Them Studio
 */

export const CONFIG = {
  MODEL_ID_3_5: "lyria-3-pro-preview",
  MODEL_ID_3_PRO: "lyria-3-pro-preview",
  MODEL_ID_3_CLIP: "lyria-3-clip-preview",
  MODEL_ID_FULL: "lyria-3-pro-preview",
  MODEL_ID_SHORT: "lyria-3-clip-preview",
  IMAGE_MODEL: "gemini-3.1-flash-lite-image",
  TEXT_MODEL: "gemini-3.8-flash",
  TTS_MODEL: "gemini-3.8-flash-tts",
  MAX_SONG_DURATION_SECONDS: 230, // 3 minutes 50 seconds hard cutoff for any song
  MAX_SONG_DURATION_LABEL: "3:50",
  PODCAST_MIN_MINUTES: 5,
  PODCAST_MAX_MINUTES: 10,
  IS_MAINTENANCE_MODE: false,
};
