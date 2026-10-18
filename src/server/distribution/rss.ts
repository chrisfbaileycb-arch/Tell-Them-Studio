import { createHash } from 'node:crypto';
import type { PublicShow } from '../../types/distribution';

/** Characters that are illegal in XML 1.0 are dropped; markup characters are escaped. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export const xmlEscape = (v: string): string =>
  v
    .replace(ILLEGAL_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string;
  pubDate: Date;
  /** Absolute URL of the stable audio endpoint. */
  audioUrl: string;
  audioBytes: number;
  audioMime: string;
  durationLabel: string | null;
  episodeNumber: number;
}

export interface FeedOptions {
  feedUrl: string;
  siteUrl: string;
}

/** `m:ss` or `mm:ss` -> `HH:MM:SS` for itunes:duration; undefined when unparseable. */
export function itunesDuration(label: string | null): string | undefined {
  const m = label ? /^(\d{1,3}):(\d{2})$/.exec(label) : null;
  if (!m) return undefined;
  const total = Number(m[1]) * 60 + Number(m[2]);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** RSS 2.0 with iTunes + Atom namespaces. Pure function: easy to test and to cache. */
export function buildFeedXml(show: PublicShow, episodes: FeedEpisode[], opts: FeedOptions): string {
  const e = xmlEscape;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${e(show.title)}</title>`,
    `    <link>${e(opts.siteUrl)}</link>`,
    `    <atom:link href="${e(opts.feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${e(show.description || show.title)}</description>`,
    `    <language>${e(show.language)}</language>`,
    `    <generator>Tell Them Studio</generator>`,
    `    <itunes:author>${e(show.author)}</itunes:author>`,
    `    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>`,
    `    <itunes:category text="${e(show.category)}" />`,
    `    <itunes:type>episodic</itunes:type>`,
  ];
  if (episodes.length) lines.push(`    <lastBuildDate>${episodes[0].pubDate.toUTCString()}</lastBuildDate>`);
  for (const ep of episodes) {
    const duration = itunesDuration(ep.durationLabel);
    lines.push(
      '    <item>',
      `      <title>${e(ep.title)}</title>`,
      `      <description>${e(ep.description)}</description>`,
      `      <guid isPermaLink="false">${e(ep.guid)}</guid>`,
      `      <pubDate>${ep.pubDate.toUTCString()}</pubDate>`,
      `      <enclosure url="${e(ep.audioUrl)}" length="${Math.max(0, Math.trunc(ep.audioBytes))}" type="${e(ep.audioMime)}" />`,
      `      <itunes:episode>${ep.episodeNumber}</itunes:episode>`,
      `      <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>`
    );
    if (duration) lines.push(`      <itunes:duration>${duration}</itunes:duration>`);
    lines.push('    </item>');
  }
  lines.push('  </channel>', '</rss>', '');
  return lines.join('\n');
}

/** Strong validator for conditional requests. */
export const feedEtag = (xml: string) => `"${createHash('sha256').update(xml).digest('hex').slice(0, 32)}"`;
