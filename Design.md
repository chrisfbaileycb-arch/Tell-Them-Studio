# Tell Them Studio Design Document

## Overview
Tell Them Studio is a consumer-grade creative audio production suite powered by Google GenAI models. It empowers creators to compose full songs and jingles, generate multi-host mini-podcasts with natural dual-speaker dialogue, craft radio/broadcast commercials, build local playlists and radio syndication packages, and publish to an interactive community showcase.

## Core Workspaces & Capabilities

### 1. Music Studio & Band Production
- **Description**: Users compose audio tracks (30-second clips or full arrangements) across genres (Rock, Electronic, Pop, Hair Metal, Indie, Serenity, Jazz, and Custom Blends) with flexible vocal modes (Solo, Duet, Trade-Off, Singer-Free Instrumental, and Custom Lyrics).
- **Fallbacks & Reliability**: If external Lyria audio endpoints are unavailable or quota limits are met, a deterministic synthetic audio pipeline (`creativeAudio.ts`) immediately synthesizes authentic WAV audio to ensure uninterrupted workflow.
- **Visual & Title Generation**: Automatically generates song titles and square cover artwork matching genre themes and lyrical motifs.

### 2. Multi-Host Mini-Podcasts
- **Description**: Generates 5–10 minute structured conversational episodes featuring dual hosts with distinct voices (e.g. Puck and Kore), complete with episode titles, show notes, and chapter breakdowns.
- **Workflow**: Features audio sample previews, customizable release-planning notes, and handoff links.

### 3. Commercial & Broadcast Ad Studio
- **Description**: Crafts authentic 30s radio and video commercial spots with compelling hook-to-call-to-action storytelling, narration scripts, and 3-frame visual storyboards complying with PG broadcast standards.

### 4. Radio Stations & Platform Syndication
- **Description**: Provides local radio station programming across curated themes, station audio beds, and one-click handoff packages to top creator platforms (YouTube, Spotify, Apple Podcasts, TikTok, Instagram, and more) with zero stored API credentials.

### 5. Public Community Showcase & Library
- **Description**: Creators can save sketches privately, curate a local library, and publish tracks to a public community feed featuring real-time playback, waveform visualization, variable playback speed (0.5x–2.0x), and respectful creator praise tags.

### 6. Creative Assistant & Sound Discovery
- **Description**: Server-proxied creative collaborator providing lyric songwriting, sound design advice, and track mashup assistance while maintaining strict security boundaries (API keys never enter client bundles).

### 7. Video & Media Export
- **Description**: Generates high-definition 1080p spectrum visualizer videos and synchronized lyric/caption videos ready for direct social video sharing using Web Audio and Canvas APIs.

## Architecture

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Recharts.
- **Backend**: Express proxy server (`server.ts`) handling AI inference, rate limiting, CORS origin control, security headers, and static file delivery.
- **Security Boundaries**: Provider API keys (`GEMINI_API_KEY`) reside exclusively in server environments and are never transmitted to client Vite bundles.
- **State Management**: Domain-modular React state slices, persistent drafts (`useDraft`), and a dedicated `PlaybackContext` for community audio.
- **Error Handling & Resilience**: Declarative React `ErrorBoundary` and type-safe error normalization across all client/server boundaries.

## Cloud Runtime & Live Deployment Architecture (Zero Localhost)

- **Zero-Localhost Execution**: All client API requests route through relative `/api/*` proxies, operating dynamically against the live deployment domain without hardcoded hostnames or ports.
- **Containerization**: Multi-stage production `Dockerfile` (Node 22 alpine runtime) packaging pre-built Vite assets with an unprivileged non-root user (`node`).
- **Cloud Orchestration Compatibility**: Full compatibility with Google Cloud Run, Firebase App Hosting, AWS App Runner / ECS, Fly.io, and Render with automated `PORT` detection and `SIGTERM`/`SIGINT` graceful shutdown handling.
- **Security Headers & CORS**: Strict production headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`) and dynamic origin negotiation via `ALLOWED_ORIGINS`.
- **Diagnostic Probes**: Automated `GET /api/health` HTTP endpoint for container liveness and readiness monitoring.

