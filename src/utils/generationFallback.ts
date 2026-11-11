/**
 * Plain-language wording for placeholder results.
 *
 * When the AI provider is not connected or does not answer, the server substitutes a built-in
 * sketch so the workflow keeps moving. That must never be presented as the thing the creator
 * asked for, so every surface that shows a result uses these strings.
 */
import type { GenerationFallback } from '../../types';

export type GeneratedKind = 'song' | 'podcast' | 'commercial';

const cause = (f: GenerationFallback): string =>
  f.reason === 'not_configured'
    ? 'AI generation is not connected on this server yet'
    : 'The AI service did not return a result this time';

/** Short badge shown in place of the usual origin / length labels. */
export const placeholderLabel = (kind: GeneratedKind): string =>
  kind === 'song' ? 'Placeholder sketch' : kind === 'podcast' ? 'Placeholder episode' : 'Placeholder spot';

/** One or two sentences explaining exactly what is and is not real in this result. */
export function describeGenerationFallback(kind: GeneratedKind, f: GenerationFallback): string {
  const retry = ' Try again in a moment.';

  if (kind === 'song') {
    const lyrics = f.text ? ' The lyrics are stock placeholder lines.' : '';
    return `${cause(f)}, so this is a built-in instrumental sketch of about a minute, not your finished song.${lyrics}${retry}`;
  }

  const voices = kind === 'podcast' ? 'your hosts' : 'your voiceover';
  const words = kind === 'podcast' ? 'script' : 'ad copy';

  if (f.audio && f.text) {
    return `${cause(f)}, so this is a placeholder: the audio is a music bed, not ${voices}, and the ${words} is a short stand-in.${retry}`;
  }
  if (f.audio) {
    return `${cause(f)} for the voices, so the audio is a placeholder music bed, not ${voices}. The ${words} below is real.${retry}`;
  }
  return `The ${words} could not be written this time, so what you hear is a short stand-in ${words}.${retry}`;
}
