import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
      plugins: [
        sitePartials(),
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: false,
          includeAssets: [
            'favicon.svg',
            'apple-touch-icon.png',
            'pwa-192x192.png',
            'pwa-512x512.png',
            'pwa-maskable-512x512.png',
          ],
          manifest: {
            id: '/',
            name: 'Tell Them Studio',
            short_name: 'Tell Them',
            description:
              'A trend-setting social creation studio for building custom radio stations, multi-singer band tracks, scheduled mini-podcasts, craft commercials, and seasonal holiday hits.',
            theme_color: '#0d1422',
            background_color: '#0d1422',
            display: 'standalone',
            start_url: '/',
            scope: '/',
            orientation: 'any',
            categories: ['music', 'entertainment', 'productivity'],
            icons: [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/pwa-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
            shortcuts: [
              {
                name: 'Open Music Studio',
                short_name: 'Studio',
                description: 'Create original songs, podcasts, and radio spots',
                url: '/studio',
                icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
              },
              {
                name: 'Community Showcase',
                short_name: 'Showcase',
                description: 'Listen to published tracks and podcasts',
                url: '/showcase',
                icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
              },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
            navigateFallback: null,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365,
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365,
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
            ],
          },
          devOptions: {
            enabled: true,
            type: 'module',
          },
        }),
      ],
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
