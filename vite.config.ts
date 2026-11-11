import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { expandSitePartials } from './src/site/partials';

/**
 * Stamps the shared header, footer, pricing and legal fragments into the static marketing
 * pages. Runs before Vite's own HTML processing, so injected tags are bundled like any other.
 */
function sitePartials(): Plugin {
  return {
    name: 'tell-them-site-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => expandSitePartials(html, ctx.path),
    },
  };
}

const page = (file: string) => path.resolve(__dirname, file);

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true as const,
      },
      plugins: [sitePartials(), react()],
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            // Marketing and legal pages (static HTML, small script).
            main: page('index.html'),
            pricing: page('pricing.html'),
            terms: page('terms.html'),
            privacy: page('privacy.html'),
            refunds: page('refunds.html'),
            share: page('share.html'),
            notFound: page('404.html'),
            // Applications.
            studio: page('studio.html'),
            showcase: page('showcase.html'),
          },
        },
      },
    };
});
