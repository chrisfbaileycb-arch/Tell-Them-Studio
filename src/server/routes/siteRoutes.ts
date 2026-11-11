import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { SITE } from '../../config/site';
import type { CatalogContext } from '../catalog/factory';
import { attributionFor, isPubliclyVisible } from '../governance';
import { publicOrigin, type PageMeta, type PageRenderer } from '../pages';
import { shareBody, shareMeta } from '../sharePage';

/**
 * Page routes: the marketing and legal pages, the two applications (studio, showcase), the
 * public share page for a published creation, and the crawler files.
 */

interface StaticPage {
  path: string;
  file: string;
  title: string;
  description: string;
}

/** Indexable pages with per-request title, description and social tags. */
const PAGES: StaticPage[] = [
  {
    path: '/',
    file: 'index.html',
    title: `${SITE.name} · Make a song, podcast or radio spot from a few words`,
    description: SITE.description,
  },
  {
    path: '/pricing',
    file: 'pricing.html',
    title: `Pricing · ${SITE.name}`,
    description:
      'Membership plans with monthly credits for songs, podcasts and radio spots. Start free. Preview pricing: paid plans are not on sale yet.',
  },
  {
    path: '/terms',
    file: 'terms.html',
    title: `Terms of use · ${SITE.name}`,
    description: `The rules for using ${SITE.name}: what you bring, what you make, publishing and community standards.`,
  },
  {
    path: '/privacy',
    file: 'privacy.html',
    title: `Privacy · ${SITE.name}`,
    description: `What ${SITE.name} stores, what stays in your browser, and the choices you have.`,
  },
  {
    path: '/refunds',
    file: 'refunds.html',
    title: `Refunds and cancelling · ${SITE.name}`,
    description: `How cancelling and refunds will work for ${SITE.name} paid plans.`,
  },
];

/** The applications are self-contained pages; they keep their own static head. */
const APPS: Record<string, string> = { '/studio': 'studio.html', '/showcase': 'showcase.html' };

/** `/name.html` addresses are redirected to the clean route so templates are never served raw. */
const HTML_ALIASES: Record<string, string> = {
  index: '/',
  studio: '/studio',
  showcase: '/showcase',
  ...Object.fromEntries(PAGES.filter((p) => p.path !== '/').map((p) => [p.file.replace(/\.html$/, ''), p.path])),
};

const NOT_FOUND: Omit<PageMeta, 'path'> = {
  title: `Page not found · ${SITE.name}`,
  description: 'That page is not here. It may have moved, or the track may have been unpublished.',
  noindex: true,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const xml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);

function sendHtml(res: Response, html: string, status = 200, cacheControl = 'no-cache'): void {
  res.status(status).set('Cache-Control', cacheControl).type('html').send(html);
}

export interface SiteRouteOptions {
  renderer: PageRenderer;
  getContext: () => Promise<CatalogContext>;
}

export function createSiteRouter({ renderer, getContext }: SiteRouteOptions): Router {
  const router = Router();

  const notFound = async (req: Request, res: Response, status = 404): Promise<void> => {
    sendHtml(res, await renderer.render('404.html', { ...NOT_FOUND, path: req.path }, publicOrigin(req)), status);
  };

  for (const page of PAGES) {
    router.get(page.path, async (req, res, next) => {
      try {
        const meta: PageMeta = { title: page.title, description: page.description, path: page.path };
        sendHtml(res, await renderer.render(page.file, meta, publicOrigin(req)));
      } catch (err) {
        next(err);
      }
    });
  }

  const serveApp = (file: string): RequestHandler => async (req, res, next) => {
    try {
      sendHtml(res, await renderer.render(file, { title: SITE.name, description: SITE.description, path: req.path }, publicOrigin(req)));
    } catch (err) {
      next(err);
    }
  };
  router.get('/studio', serveApp(APPS['/studio']));
  router.get(['/showcase', '/showcase/{*splat}'], serveApp(APPS['/showcase']));

  // Public page for one published creation. Anything not publicly visible (private, pending
  // moderation, withdrawn) is indistinguishable from a creation that does not exist.
  router.get('/s/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!UUID.test(id)) return await notFound(req, res);

      let ctx: CatalogContext;
      try {
        ctx = await getContext();
      } catch {
        res.set('Retry-After', '60');
        return await notFound(req, res, 503);
      }

      const creation = await ctx.repo.getCreation(id);
      const moderation = creation ? await ctx.repo.getModeration(id) : null;
      if (!creation || !isPubliclyVisible(creation, moderation)) return await notFound(req, res);

      const creator = await ctx.repo.getCreatorById(creation.creatorId);
      const view = {
        creation,
        handle: creator?.handle ?? '@unknown',
        remixOf: await attributionFor(ctx, creation.remixOfId),
        origin: publicOrigin(req),
      };
      const html = await renderer.render('share.html', shareMeta(view), view.origin, { __TT_SHARE_BODY__: shareBody(view) });
      sendHtml(res, html, 200, 'public, max-age=60');
    } catch (err) {
      next(err);
    }
  });

  router.get('/robots.txt', (req, res) => {
    res
      .type('text/plain')
      .set('Cache-Control', 'public, max-age=3600')
      .send(['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${publicOrigin(req)}/sitemap.xml`, ''].join('\n'));
  });

  router.get('/sitemap.xml', async (req, res, next) => {
    try {
      const origin = publicOrigin(req);
      const entries: Array<{ loc: string; lastmod?: string }> = [
        ...PAGES.map((p) => ({ loc: `${origin}${p.path}` })),
        { loc: `${origin}/showcase` },
      ];
      try {
        const ctx = await getContext();
        let cursor: string | null = null;
        // Newest published creations first; capped so the file stays small.
        for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
          const page = await ctx.repo.listPublished({ limit: 50, cursor });
          for (const c of page.items) entries.push({ loc: `${origin}/s/${c.id}`, lastmod: c.updatedAt });
          cursor = page.nextCursor;
          if (!cursor) break;
        }
      } catch {
        /* Catalog unavailable: the static pages are still listed. */
      }
      const body = entries
        .map((e) => `  <url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${xml(e.lastmod)}</lastmod>` : ''}</url>`)
        .join('\n');
      res
        .type('application/xml')
        .set('Cache-Control', 'public, max-age=600')
        .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
    } catch (err) {
      next(err);
    }
  });

  router.get(/^\/([\w-]+)\.html$/, async (req, res, next) => {
    try {
      const target = HTML_ALIASES[String(req.params[0])];
      if (target) return res.redirect(301, target);
      await notFound(req, res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Last handler in the chain. Unknown API paths get JSON, missing files a short plain answer,
 * and everything else the designed not-found page.
 */
export function createNotFoundHandler(renderer: PageRenderer): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      if (!isRead || req.path.startsWith('/api/') || req.path.startsWith('/feeds/')) {
        res.status(404).json({ error: 'Not found.', code: 'not_found' });
        return;
      }
      if (/\.[a-z0-9]{2,12}$/i.test(req.path)) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      sendHtml(res, await renderer.render('404.html', { ...NOT_FOUND, path: req.path }, publicOrigin(req)), 404);
    } catch (err) {
      next(err);
    }
  };
}
