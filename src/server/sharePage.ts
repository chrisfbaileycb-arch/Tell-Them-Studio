import { createUniqueSongArtworkSvg } from '../../constants';
import { SITE } from '../config/site';
import type { RemixAttribution, StoredCreation } from '../types/community';
import { cleanLyricsForDisplay } from '../utils/lyricsUtils';
import { escapeHtml as e, jsonLd, type PageMeta } from './pages';

/**
 * The public page for one published creation (`/s/:id`). Everything a listener needs is in the
 * HTML the server sends: title, creator, origin label, a native audio player and the lyrics.
 * That is what makes a shared link show a proper preview and play without JavaScript.
 */

export interface ShareView {
  creation: StoredCreation;
  handle: string;
  remixOf: RemixAttribution | null;
  origin: string;
}

const REPORT_REASONS: Array<[string, string]> = [
  ['rights', 'I own this / rights violation'],
  ['harassment', 'Harassment or hate'],
  ['pii', 'Shares personal information'],
  ['unsafe', 'Unsafe or illegal content'],
  ['other', 'Something else'],
];

const isPodcast = (c: StoredCreation) => c.kind === 'podcast';
const audioPath = (c: StoredCreation) => `/api/creations/${encodeURIComponent(c.id)}/audio`;
const sharePath = (c: StoredCreation) => `/s/${encodeURIComponent(c.id)}`;

export function shareMeta({ creation, handle, origin }: ShareView): PageMeta {
  const kind = isPodcast(creation) ? 'Podcast episode' : 'Song';
  const title = `${creation.title} by ${handle} · ${SITE.name}`;
  const description = `${kind} in ${creation.genre} by ${handle}. ${creation.provenance}. Listen on ${SITE.name}.`;
  const audioUrl = `${origin}${audioPath(creation)}`;
  return {
    title,
    description,
    path: sharePath(creation),
    ogType: isPodcast(creation) ? 'website' : 'music.song',
    extraHead: [
      `<meta property="og:audio" content="${e(audioUrl)}">`,
      `<meta property="og:audio:type" content="${e(creation.audioMime)}">`,
      jsonLd({
        '@context': 'https://schema.org',
        '@type': isPodcast(creation) ? 'PodcastEpisode' : 'MusicRecording',
        name: creation.title,
        url: `${origin}${sharePath(creation)}`,
        datePublished: creation.createdAt,
        genre: creation.genre,
        [isPodcast(creation) ? 'author' : 'byArtist']: { '@type': 'Person', name: handle },
        audio: { '@type': 'AudioObject', contentUrl: audioUrl, encodingFormat: creation.audioMime },
        creditText: creation.provenance,
      }),
    ].join('\n    '),
  };
}

export function shareBody({ creation, handle, remixOf }: ShareView): string {
  const podcast = isPodcast(creation);
  const noun = podcast ? 'episode' : 'song';
  const cover = createUniqueSongArtworkSvg({
    title: creation.title,
    genre: creation.genre,
    lyrics: creation.lyrics,
    creatorHandle: handle,
    seed: creation.id,
    motif: podcast ? 'podcast' : 'band',
  });
  const created = new Date(creation.createdAt);
  const date = Number.isNaN(created.getTime())
    ? ''
    : ` · <time datetime="${e(created.toISOString())}">${e(
        created.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
      )}</time>`;
  const lyrics = cleanLyricsForDisplay(creation.lyrics || '').trim();

  return `<article class="share" data-creation="${e(creation.id)}">
        <div class="share-art">
          <img src="${e(cover)}" width="600" height="600" alt="Cover art for ${e(creation.title)}">
        </div>
        <div class="share-main">
          <p class="eyebrow">${podcast ? 'Podcast episode' : 'Song'} · ${e(creation.genre)}</p>
          <h1>${e(creation.title)}</h1>
          <p class="share-byline">by <span class="handle">${e(handle)}</span>${date}</p>
          ${
            remixOf
              ? `<p class="share-remix" data-testid="share-remix">Remix of “${e(remixOf.title)}” by ${e(remixOf.creatorHandle)}</p>`
              : ''
          }
          <audio controls preload="metadata" src="${e(audioPath(creation))}">Your browser cannot play this audio.</audio>
          <p class="share-provenance"><span class="badge">${e(creation.provenance)}</span><span>Made with ${e(SITE.name)}.</span></p>
          <div class="share-actions">
            <button class="btn btn-secondary" type="button" data-copy-link>Copy link</button>
            <a class="btn btn-primary" href="/studio">Make your own</a>
            <p class="share-status" role="status" data-share-status></p>
          </div>
          ${
            lyrics
              ? `<section class="share-lyrics" aria-labelledby="share-lyrics-title">
            <h2 id="share-lyrics-title">${podcast ? 'Transcript' : 'Lyrics'}</h2>
            <pre>${e(lyrics)}</pre>
          </section>`
              : ''
          }
          <details class="share-report">
            <summary>Report this ${noun}</summary>
            <form data-report="${e(creation.id)}">
              <label>Reason
                <select name="reason">
                  ${REPORT_REASONS.map(([value, label]) => `<option value="${value}">${e(label)}</option>`).join('')}
                </select>
              </label>
              <label>Details (optional)
                <textarea name="details" rows="3" maxlength="500"></textarea>
              </label>
              <button class="btn btn-ghost btn-sm" type="submit">Send report</button>
              <p role="status" data-report-status></p>
            </form>
          </details>
        </div>
      </article>`;
}
