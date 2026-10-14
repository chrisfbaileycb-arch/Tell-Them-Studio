/**
 * Audio Utilities & Studio WAV Synthesis Helper
 */
import { logFunctionCall } from './logger';

/**
 * Creates a playable object URL from a base64 encoded audio string.
 */
export const createAudioUrlFromBase64 = (base64: string, mimeType: string): string => {
  logFunctionCall('createAudioUrlFromBase64', { base64Length: base64.length, mimeType });
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    let blob: Blob;
    if (/audio\/(L16|pcm)/i.test(mimeType)) {
      // Provider PCM payloads have no RIFF header; wrap mono signed 16-bit PCM.
      const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
      const header = new ArrayBuffer(44), view = new DataView(header);
      const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + bytes.length, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, bytes.length, true); blob = new Blob([header, bytes], { type: 'audio/wav' });
    } else { blob = new Blob([bytes], { type: mimeType }); }
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Failed to decode audio base64:', e);
    return '';
  }
};

/**
 * Synthesizes a short, warm multi-chord studio preview WAV Blob URL for seeded community tracks
 * so users can immediately preview, play radio stations, or test video export before generating new tracks.
 */
export const createStudioPreviewWavUrl = (style: 'rock' | 'disco' = 'rock'): string => {
  const sampleRate = 24000;
  const durationSeconds = 8;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const chordProg =
    style === 'rock'
      ? [
          [196.0, 246.94, 293.66, 392.0], // G
          [293.66, 369.99, 440.0, 587.33], // D
          [164.81, 196.0, 246.94, 329.63], // Em
          [261.63, 329.63, 392.0, 523.25], // C
        ]
      : [
          [174.61, 220.0, 261.63, 329.63], // Fmaj7
          [196.0, 246.94, 293.66, 349.23], // G7
          [164.81, 196.0, 246.94, 293.66], // Em7
          [220.0, 261.63, 329.63, 392.0], // Am7
        ];

  const bpm = style === 'rock' ? 128 : 120;
  const beatDur = 60 / bpm;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / (beatDur * 4)) % chordProg.length;
    const chord = chordProg[barIdx];
    const beatPhase = (t % beatDur) / beatDur;
    const env = Math.exp(-beatPhase * 3.2);

    // Bass + chord harmony + subtle kick pulse
    const kick = beatPhase < 0.12 ? Math.sin(2 * Math.PI * (110 - beatPhase * 550) * t) * 0.45 : 0;
    const bass = Math.sin(2 * Math.PI * (chord[0] / 2) * t) * 0.25;
    const harmony =
      (Math.sin(2 * Math.PI * chord[0] * t) +
        Math.sin(2 * Math.PI * chord[1] * t) +
        Math.sin(2 * Math.PI * chord[2] * t) +
        Math.sin(2 * Math.PI * chord[3] * t) * 0.7) *
      0.12 *
      (0.5 + 0.5 * env);

    const sample = Math.max(-0.95, Math.min(0.95, kick + bass + harmony));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

/**
 * Checks community praise, comments, and prompts against Tell Them Studio's
 * Kindness-First, Family-Safe (PG), and Royalty/Trademark Respect standards.
 */
export const validateKindnessAndSafety = (
  text: string
): { valid: boolean; reason?: string; suggestion?: string } => {
  const lower = text.toLowerCase();
  const unkindWords = [
    'trash',
    'garbage',
    'terrible',
    'horrible',
    'stupid',
    'awful',
    'sucks',
    'hate you',
    'worst',
    'ugly',
    'shut up',
    'idiot',
    'loser',
  ];
  for (const w of unkindWords) {
    if (lower.includes(w)) {
      return {
        valid: false,
        reason:
          'Tell Them Studio is a 100% supportive, kindness-first creation community. Put-downs and negative remarks are not permitted.',
        suggestion: 'Try sharing constructive encouragement, a question about their arrangement, or a specific musical compliment!',
      };
    }
  }

  // Personal contact data check (handles only, no phone numbers or emails in public comments)
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text) || /\S+@\S+\.\S+/.test(text)) {
    return {
      valid: false,
      reason:
        'For creator safety, all connections happen exclusively under studio handles (@handle). Please do not share personal phone numbers or email addresses.',
    };
  }

  return { valid: true };
};
