import type { ContentOriginType } from '../../types';
import { checkPersonalContact, checkUnkindLanguage } from '../services/contentSafety';
import type {
  CreateCreationRequest,
  CreationKind,
  ModerationStatus,
} from '../types/community';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Maximum accepted base64 length for MAX_AUDIO_BYTES of audio (plus padding). */
export const MAX_AUDIO_BASE64_CHARS = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4;

const PROVENANCE: ContentOriginType[] = [
  'AI-Generated Material',
  'Human Voice + AI Backing Band',
  'AI Multi-Host Podcast',
];
const KINDS: CreationKind[] = ['music', 'podcast'];
const CLIENT_REF = /^[A-Za-z0-9_.:-]{1,80}$/;
const REMOTE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export interface ValidatedCreation {
  title: string;
  genre: string;
  lyrics: string;
  provenance: ContentOriginType;
  kind: CreationKind;
  durationLabel: string | null;
  vocalArrangement: string | null;
  narratorInfo: string | null;
  remixOfId: string | null;
  remixPermitted: boolean | null;
  waveformJson: string | null;
  clientRef: string | null;
  audio: Buffer;
}

export type ValidationResult =
  | { ok: true; value: ValidatedCreation }
  | { ok: false; status: number; code: string; error: string };

const fail = (status: number, code: string, error: string): ValidationResult => ({ ok: false, status, code, error });

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (v: string) => v.replace(CONTROL_CHARS, '').trim();

function optionalString(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const c = clean(v);
  return c.length > max ? undefined : c || null;
}

export function validateCreationRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') return fail(400, 'invalid_body', 'A JSON body is required.');
  const b = input as Partial<CreateCreationRequest> & Record<string, unknown>;

  if (typeof b.title !== 'string' || !clean(b.title) || clean(b.title).length > 120) {
    return fail(400, 'invalid_title', 'Title is required (up to 120 characters).');
  }
  if (typeof b.genre !== 'string' || !clean(b.genre) || clean(b.genre).length > 80) {
    return fail(400, 'invalid_genre', 'Genre is required (up to 80 characters).');
  }
  if (b.lyrics !== undefined && (typeof b.lyrics !== 'string' || b.lyrics.length > 20000)) {
    return fail(400, 'invalid_lyrics', 'Lyrics must be text up to 20,000 characters.');
  }
  if (!PROVENANCE.includes(b.provenance as ContentOriginType)) {
    return fail(400, 'invalid_provenance', 'A valid content origin identifier is required.');
  }
  const kind = (b.kind ?? 'music') as CreationKind;
  if (!KINDS.includes(kind)) return fail(400, 'invalid_kind', 'Only music and podcast creations can be stored.');

  const durationLabel = optionalString(b.durationLabel, 16);
  if (durationLabel === undefined || (durationLabel && !/^\d{1,3}:\d{2}$/.test(durationLabel))) {
    return fail(400, 'invalid_duration', 'Duration must look like 3:42.');
  }
  const vocalArrangement = optionalString(b.vocalArrangement, 80);
  const narratorInfo = optionalString(b.narratorInfo, 200);
  if (vocalArrangement === undefined || narratorInfo === undefined) {
    return fail(400, 'invalid_metadata', 'Vocal arrangement or narrator info is too long.');
  }

  let remixOfId: string | null = null;
  if (b.remixOfId !== undefined && b.remixOfId !== null) {
    if (typeof b.remixOfId !== 'string' || !REMOTE_ID.test(b.remixOfId)) {
      return fail(400, 'invalid_remix', 'remixOfId is malformed.');
    }
    remixOfId = b.remixOfId;
  }

  let remixPermitted: boolean | null = null;
  if (b.remixPermitted !== undefined && b.remixPermitted !== null) {
    if (typeof b.remixPermitted !== 'boolean') return fail(400, 'invalid_remix_permission', 'remixPermitted must be true or false.');
    remixPermitted = b.remixPermitted;
  }

  let waveformJson: string | null = null;
  if (b.waveformJson !== undefined && b.waveformJson !== null) {
    if (typeof b.waveformJson !== 'string' || b.waveformJson.length > 65536) {
      return fail(400, 'invalid_waveform', 'Waveform data is too large.');
    }
    try {
      const arr = JSON.parse(b.waveformJson);
      if (!Array.isArray(arr) || arr.length > 2048 || arr.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        return fail(400, 'invalid_waveform', 'Waveform must be an array of numbers.');
      }
    } catch {
      return fail(400, 'invalid_waveform', 'Waveform must be valid JSON.');
    }
    waveformJson = b.waveformJson;
  }

  let clientRef: string | null = null;
  if (b.clientRef !== undefined && b.clientRef !== null) {
    if (typeof b.clientRef !== 'string' || !CLIENT_REF.test(b.clientRef)) {
      return fail(400, 'invalid_client_ref', 'clientRef is malformed.');
    }
    clientRef = b.clientRef;
  }

  if (typeof b.audioBase64 !== 'string' || !b.audioBase64) {
    return fail(400, 'missing_audio', 'Audio is required.');
  }
  if (b.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return fail(413, 'audio_too_large', `Audio exceeds the ${MAX_AUDIO_BYTES / 1024 / 1024} MB limit.`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b.audioBase64)) {
    return fail(400, 'invalid_audio_encoding', 'Audio must be base64 encoded.');
  }
  const audio = Buffer.from(b.audioBase64, 'base64');
  if (audio.length > MAX_AUDIO_BYTES) {
    return fail(413, 'audio_too_large', `Audio exceeds the ${MAX_AUDIO_BYTES / 1024 / 1024} MB limit.`);
  }

  return {
    ok: true,
    value: {
      title: clean(b.title),
      genre: clean(b.genre),
      lyrics: typeof b.lyrics === 'string' ? b.lyrics.replace(CONTROL_CHARS, '') : '',
      provenance: b.provenance as ContentOriginType,
      kind,
      durationLabel: durationLabel ?? null,
      vocalArrangement: vocalArrangement ?? null,
      narratorInfo: narratorInfo ?? null,
      remixOfId,
      remixPermitted,
      waveformJson,
      clientRef,
      audio,
    },
  };
}

export interface SniffedAudio {
  mime: string;
  ext: string;
}

/** Identifies audio by magic bytes; the client-declared MIME type is never trusted. */
export function sniffAudio(buf: Buffer): SniffedAudio | null {
  if (buf.length < 12) return null;
  const ascii = (start: number, end: number) => buf.toString('latin1', start, end);
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(0, 4) === 'fLaC') return { mime: 'audio/flac', ext: 'flac' };
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' };
  if (ascii(4, 8) === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' };
  return null;
}

export interface ModerationVerdict {
  status: Extract<ModerationStatus, 'approved' | 'rejected'>;
  flagReason: string | null;
}

/**
 * Phase 3 publication policy (automatic): reject personal contact details anywhere in the public
 * text, and put-downs in the title. Lyrics are not run through the put-down filter so legitimate
 * song language is not blocked. `pending` is reserved for a future human-review queue.
 */
export function moderateForPublication(input: {
  title: string;
  genre: string;
  lyrics: string;
  narratorInfo?: string | null;
}): ModerationVerdict {
  const pii = checkPersonalContact(
    [input.title, input.genre, input.lyrics, input.narratorInfo ?? ''].join('\n')
  );
  if (!pii.valid) return { status: 'rejected', flagReason: pii.reason ?? 'Personal contact details are not permitted.' };
  const unkind = checkUnkindLanguage(input.title);
  if (!unkind.valid) return { status: 'rejected', flagReason: unkind.reason ?? 'Please keep titles kind and respectful.' };
  return { status: 'approved', flagReason: null };
}
