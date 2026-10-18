# Tell Them Studio (`tell-them-studio` v1.0.0)

**Commercial-Grade Generative Audio Production, Multi-Host Podcast Syndication & Music Creation SaaS**

Tell Them Studio is a multi-tenant generative audio production platform and public distribution network powered by **Google Gemini** and **Lyria**. Designed for zero-local-dependency cloud deployment, the platform unifies full-band music composition, multi-speaker podcast production, broadcast commercial spots, custom radio stations, and an isolated public showcase (`Told Them`) with automated RSS 2.0 / iTunes podcast syndication and HMAC-signed webhooks.

---

## 1. Product Overview & Mission

Tell Them Studio empowers independent creators, bands, podcasters, and brands to compose, master, govern, and syndicate original audio from a single studio interface:

- **Generative Music Studio (`#bands`)**: Full-length arrangements (up to 3:50) and 0:30 hooks powered by Lyria (`lyria-3-pro-preview` / `lyria-3-clip-preview`) with deterministic studio synthesizer fallback, multi-singer vocal modes (Lead, Duet, Choir, Rap, Instrumental), custom genre blending, and AI-generated editorial album artwork.
- **Multi-Host Podcast Studio (`#podcasts`)**: Structured 5–10 minute conversational episodes with chapter markers, show notes, and multi-speaker Gemini TTS synthesis (`Puck`, `Kore`, `Fenrir`, `Aoede`, `Charon`).
- **Broadcast Commercials (`#commercials`) & Seasonal Hits (`#holidays`)**: Truth-in-advertising compliant 15s/30s/60s radio spots with three-act visual storyboards and family-safe voiceovers.
- **Custom Radio Stations (`#stations`) & Creative Assistant (`#creative`)**: Interactive lyric design, sound discovery, offline Web Audio stem/mashup mixing, and real-time Canvas/Web Audio spectrum video export (`.webm`).
- **Told Them Public Showcase (`/showcase` & `#listen`)**: Dedicated public listening room and standalone bundle (`showcase.html`) featuring verified creator handles, remix lineage attribution, community praise badges, and iTunes-compliant podcast RSS feeds.

---

## 2. Architecture & System Topology

Tell Them Studio runs as a unified, single-port Express 5 + Vite React 19 service (`server.ts`) that enforces strict server-side credential isolation (`GEMINI_API_KEY` never leaves the server) while serving both the studio SPA (`index.html`) and standalone public showcase (`showcase.html`).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT WORKSPACE LAYER (React 19)                     │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │   Studio Workspaces │  │  Playback & WebAudio │  │   Standalone CDN    │  │
│  │  • Music / Bands    │  │  • PlaybackContext   │  │   Showcase App      │  │
│  │  • Podcasts         │  │  • StudioPlayer      │  │  • /showcase        │  │
│  │  • Commercials      │  │  • PersistentPlayer  │  │  • Music & Podcasts │  │
│  │  • Stations/Holiday │  │  • WebM Video Export │  │  • RSS & Praise UI  │  │
│  │  • Creative/Library │  │  • ErrorBoundaries   │  │  • Report Controls  │  │
│  └──────────┬──────────┘  └──────────┬───────────┘  └──────────┬──────────┘  │
└─────────────┼────────────────────────┼─────────────────────────┼─────────────┘
              │                        │                         │
              ▼                        ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED CLOUD SERVER LAYER (server.ts)                   │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │  AI Proxy Routes    │  │  Safety & Governance │  │  Distribution & RSS │  │
│  │  • /api/generate-*  │  │  • SafetyClassifier  │  │  • /feeds/:slug.xml │  │
│  │  • /api/creative-*  │  │  • PII/Policy Guard  │  │  • Show Scheduler   │  │
│  │  • Lyria & Gemini   │  │  • Lineage & Consent │  │  • HMAC Webhooks    │  │
│  │  • Synth Fallbacks  │  │  • Soft/Hard Revoke  │  │  • Inbound Praise   │  │
│  └──────────┬──────────┘  └──────────┬───────────┘  └──────────┬──────────┘  │
│             └────────────────────────┼─────────────────────────┘             │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                 AUTO-MIGRATING PERSISTENCE & STORAGE                   │  │
│  │  • CatalogRepository: PostgresCatalogRepository <-> FileCatalogRepo    │  │
│  │  • ObjectStorageAdapter: S3ObjectStorage (R2/S3) <-> LocalObjectStorage│  │
│  │  • Durable JobQueue & Background Worker (Retries, Leases, Dead-Letter) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Environment & Cloud Deployment

Tell Them Studio is engineered for **zero-local assumptions** and deploys directly to **Google Cloud Run**, **Render**, **Railway**, or any OCI-compliant container platform using the included multi-stage `Dockerfile`.

### 1-Click / Container Cloud Deployment

1. **Build & Run with Docker (Cloud Run / Railway / Render):**
   ```bash
   docker build -t tell-them-studio:latest .
   docker run -p 8080:8080 \
     -e NODE_ENV=production \
     -e PORT=8080 \
     -e GEMINI_API_KEY="your-gemini-api-key" \
     -e SESSION_SECRET="your-32-character-minimum-session-secret" \
     tell-them-studio:latest
   ```

2. **Direct Node.js Cloud Service Deployment:**
   ```bash
   npm ci
   npm run build
   NODE_ENV=production PORT=3000 npm start
   ```
   In production mode (`NODE_ENV=production`), `server.ts` serves compiled assets from `./dist`, routes `/showcase` to `dist/showcase.html`, routes standard SPA paths to `dist/index.html`, and exposes `GET /api/health` for cloud readiness/liveness probes.

### Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` (`8080` in Docker) | Inbound HTTP port bound on `0.0.0.0`. |
| `NODE_ENV` | No | `development` | Set to `production` to serve prebuilt `./dist` bundles and enforce production security defaults. |
| `GEMINI_API_KEY` | Recommended | — | Server-side Google Gemini & Lyria API key. Never exposed to browser clients. |
| `SESSION_SECRET` | Recommended | Auto-generated fallback | 32+ character secret used to sign `HttpOnly`, `SameSite=Lax` creator session cookies (`tt_session`). |
| `DATABASE_URL` | No | Local `.data` fallback | PostgreSQL connection URI. Automatically bootstraps schema (`creators`, `creations`, `tracks`, `shows`, `episodes`, `publication_moderation`, `governance_logs`, `docs`) on startup. |
| `DATABASE_SSL` | No | `false` | Set to `true` for managed cloud PostgreSQL instances requiring TLS. |
| `DATABASE_POOL_MAX` | No | `10` | Maximum PostgreSQL connection pool size. |
| `CATALOG_DATA_DIR` | No | `.data` | Directory for `FileCatalogRepository` and `LocalObjectStorage` when `DATABASE_URL` or `S3_BUCKET` is omitted. Use `:memory:` for ephemeral test runs. |
| `S3_BUCKET` | No | Local `.data` fallback | S3-compatible bucket name (AWS S3, Cloudflare R2, MinIO) for audio object storage. |
| `S3_REGION` | No | `auto` | S3 region identifier. |
| `S3_ENDPOINT` | No | — | Custom S3 endpoint URL (required for Cloudflare R2 / MinIO). |
| `S3_ACCESS_KEY_ID` | No | — | S3 access key ID. |
| `S3_SECRET_ACCESS_KEY` | No | — | S3 secret access key. |
| `S3_KEY_PREFIX` | No | — | Optional key prefix for stored audio objects. |
| `CDN_BASE_URL` | No | — | Optional public CDN edge URL for `302` public audio redirects (`/api/creations/:id/audio`). |
| `CDN_PURGE_WEBHOOK_URL` | No | — | Optional webhook URL triggered to invalidate cached audio keys upon deletion/revocation. |
| `ALLOWED_ORIGINS` | No | Same-origin & preview hosts | Comma-separated list of additional allowed CORS origins. |
| `ADMIN_API_TOKEN` | No | — | Bearer token enabling `/api/admin/*` moderator queue and takedown endpoints. |

---

## 4. Commercial & Governance Features

- **Multi-Workspace Audio Engine**:
  - Dedicated workspaces for **Music & Bands**, **Mini-Podcasts**, **Craft Commercials**, **Seasonal/Holiday Hits**, **Radio Stations**, and **Creative Assistant** tools.
  - Real-time client-side persistence via IndexedDB (`libraryStore.ts`) paired with automatic server-side catalog synchronization (`catalogClient.ts`).
- **Built-In Safety Classifier & Moderation Pipeline**:
  - Multi-layer rule and optional AI safety classification (`SafetyClassifier.ts`, `moderation.ts`, `contentSafety.ts`) screens titles, lyrics, scripts, and praise for PII (phone numbers, emails), harassment, and policy violations prior to publication.
  - Full provenance tracking (`AI-Generated Material`, `AI Multi-Host Podcast`, `Original User Audio`), remix depth limits, and cascading soft/hard consent revocation across remix trees (`governance.ts`).
  - Community reporting with automatic flagging at configurable thresholds and moderator review endpoints (`/api/admin/reports`, `/api/admin/creations/:id/moderation`).
- **Podcast Syndication, Scheduling & Webhooks**:
  - Generates iTunes-compliant RSS 2.0 feeds (`/feeds/:slug.xml`) with `ETag` and `Last-Modified` conditional GET caching and byte-range audio streaming (`206 Partial Content`).
  - Timezone-aware weekly show scheduler (`schedule.ts`) and background job worker (`JobQueue.ts`, `worker.ts`) that automatically publishes due episodes.
  - Outbound HMAC-SHA256 signed webhooks (`X-TellThem-Signature`) with exponential backoff retries and dead-letter inspection, plus replay-protected inbound praise webhooks (`/api/inbound/praise/:sourceId`).
- **Dual-Mode Auto-Migrating Catalog Storage**:
  - `PostgresCatalogRepository` automatically runs `CREATE TABLE IF NOT EXISTS` migrations on startup—zero manual CLI migration steps required.
  - Automatically and gracefully falls back to `FileCatalogRepository` (or volatile memory storage) if `DATABASE_URL` is omitted or unreachable.

---

## 5. Verification & QA Status

Tell Them Studio is verified across **10 automated Playwright specification suites** (covering all 8 core functional verification domains plus extended UI and unit checks):

1. `tests/music-studio.spec.ts` — Genre selection, custom blends, vocal arrangements, waveform playback, cover art themes, and persistent community player controls.
2. `tests/workflows.spec.ts` — Cross-tab draft persistence, creative assistant lyric handoff, manual upload acknowledgement, and mobile viewport responsiveness.
3. `tests/creative.spec.ts` — 60-second stereo WAV synthesis verification, reference audio authorization guards, IndexedDB library persistence, stem mashup mixing, and WebM video export.
4. `tests/catalog.spec.ts` — Session authentication (`HttpOnly` / `SameSite=Lax`), private/public lifecycle, byte-range streaming (`206`), rate limiting, and persistence adapters.
5. `tests/catalog-ui.spec.ts` — Live catalog synchronization, offline cache resilience, and studio-to-community promotion flows.
6. `tests/governance.spec.ts` & `tests/governance-ui.spec.ts` — Remix lineage attribution, depth enforcement, community reporting thresholds, moderator review, and soft/hard consent revocation.
7. `tests/distribution.spec.ts` & `tests/distribution-ui.spec.ts` — SSRF-guarded outbound webhooks, HMAC signature verification, DST-aware weekly episode scheduling, and RSS 2.0 feed generation.
8. `tests/showcase-cdn.spec.ts` — Standalone `/showcase` bundle rendering, CDN `302` redirect and `?direct=1` range streaming, CDN cache purge webhooks, and offline graceful degradation.

### Build & Verification Commands

```bash
# 1. TypeScript static verification (0 errors)
npx tsc --noEmit

# 2. Multi-entry production bundle (compiles dist/index.html & dist/showcase.html)
npm run build

# 3. Full Playwright end-to-end verification suite
npm test
```

---

## License

Released under the **MIT License**. See [`LICENSE`](./LICENSE) for full license text.
