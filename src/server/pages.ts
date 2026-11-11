import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import type { ViteDevServer } from 'vite';
import { SITE } from '../config/site';
import { expandSitePartials } from '../site/partials';

/**
 * Serves the HTML pages. Pages are static templates with a few `__TT_*__` tokens that depend on
 * the request: the page title and description, and social/canonical tags that need the absolute
 * site address. Link previews (messages, social posts) do not run JavaScript, so these tags
 * have to be in the HTML the server sends.
 */

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface PageMeta {
  title: string;
  description: string;
  /** Site-relative path, used for the canonical and og:url addresses. */
  path: string;
  /** Site-relative or absolute image for link previews. Defaults to the site image. */
  image?: string;
  ogType?: string;
  /** Keep the page out of search results (error pages). */
  noindex?: boolean;
  /** Extra head tags. Must already be safe HTML. */
  extraHead?: string;
}

/**
 * The site's public address. `PUBLIC_BASE_URL` wins; otherwise it is derived from the request,
 * accepting only a plain host[:port] because the Host header is supplied by the client.
 */
export function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = req.get('host') ?? '';
  const safeHost = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? host : 'localhost';
  return `${req.protocol === 'https' ? 'https' : 'http'}://${safeHost}`;
}

const absolute = (origin: string, url: string): string => (/^https?:\/\//i.test(url) ? url : `${origin}${url}`);

/** Canonical, Open Graph and Twitter card tags for one page. */
export function headTags(meta: PageMeta, origin: string): string {
  const url = `${origin}${meta.path}`;
  const usesSiteImage = !meta.image;
  const image = absolute(origin, meta.image ?? SITE.socialImage);
  const e = escapeHtml;
  const tags = [
    meta.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${e(url)}">`,
    `<meta property="og:site_name" content="${e(SITE.name)}">`,
    `<meta property="og:type" content="${e(meta.ogType ?? 'website')}">`,
    `<meta property="og:title" content="${e(meta.title)}">`,
    `<meta property="og:description" content="${e(meta.description)}">`,
    `<meta property="og:url" content="${e(url)}">`,
    `<meta property="og:image" content="${e(image)}">`,
    ...(usesSiteImage
      ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']
      : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${e(meta.title)}">`,
    `<meta name="twitter:description" content="${e(meta.description)}">`,
    `<meta name="twitter:image" content="${e(image)}">`,
  ];
  if (meta.extraHead) tags.push(meta.extraHead);
  return tags.join('\n    ');
}

/** JSON-LD script tag; `<` is escaped so the data can never close the script element. */
export const jsonLd = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

export interface PageRenderer {
  /**
   * Renders `file` for one request. `slots` maps additional `__TT_NAME__` tokens to HTML that is
   * already safe (the caller escapes any user-supplied text).
   */
  render(file: string, meta: PageMeta, origin: string, slots?: Record<string, string>): Promise<string>;
}

const HEAD_MARKER = '<meta name="tt-head" content="">';

export function createPageRenderer(opts: { root: string; distDir: string; vite?: ViteDevServer }): PageRenderer {
  const built = new Map<string, string>();

  const load = async (file: string): Promise<string> => {
    if (opts.vite) {
      // Development: read the source page and stamp in the shared partials ourselves, because
      // the request tokens below live inside them.
      return expandSitePartials(await readFile(path.join(opts.root, file), 'utf8'), `/${file}`);
    }
    let html = built.get(file);
    if (html === undefined) {
      html = await readFile(path.join(opts.distDir, file), 'utf8');
      built.set(file, html);
    }
    return html;
  };

  return {
    async render(file, meta, origin, slots = {}) {
      const values: Record<string, string> = {
        __TT_TITLE__: escapeHtml(meta.title),
        __TT_DESCRIPTION__: escapeHtml(meta.description),
        [HEAD_MARKER]: headTags(meta, origin),
        ...slots,
      };
      // One pass over the template: inserted text is never scanned for tokens again, so a
      // creation whose title happens to contain a token cannot inject anything.
      const pattern = new RegExp(
        Object.keys(values)
          .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|'),
        'g'
      );
      const html = (await load(file)).replace(pattern, (token) => values[token]);
      return opts.vite ? opts.vite.transformIndexHtml(`/${file}`, html) : html;
    },
  };
}
