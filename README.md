# Tell Them Studio

A kindness-first music and podcast creation space, with a companion **Told Them** listening room.

## Run

Use Node.js 22+ and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The app listens on `0.0.0.0:3000`. Samples, browser storage, mixing, and visualizer export work without an API key. To enable AI, configure `GEMINI_API_KEY` **on the server** in `.env.local` or the deployment environment. Keys never enter browser code. Optional model overrides are documented in `.env.example`; provider/model availability and outbound API access are required. Live provider generation has not been verified in the restricted development sandbox.

```sh
npm run lint
npm test
npm run build
NODE_ENV=production npm start
```

CSS is compiled locally with Tailwind/PostCSS; there is no runtime Tailwind CDN dependency. Optional web fonts have system-font fallbacks.

## Spaces and capabilities

- **Band Studio:** Rock, Country, Pop, Disco, Rap, Hip-Hop, Indie, Old-School, Jazz, Electronic, Anime-Inspired, Serenity, custom blends, and singer-free backing tracks. Two original, sixty-second **procedurally synthesized instrumental sketches** per category. These illustrate broad moods; they are not finished genre recordings, vocal demos, or copyrighted artist samples.
- **Serenity:** faith, spirituality, gratitude, and gentle encouragement; all traditions welcome. No medical or healing promises. The working section name is not a trademark-clearance claim.
- **Podcasts:** existing multi-host generation, plus two approximately one-minute script previews read by browser speech synthesis. Those previews are not recordings of the selected AI host voices; availability, voice, and duration depend on the browser. Failed speech generation reports an error rather than substituting an instrumental loop. Raw PCM speech responses are wrapped in WAV headers for playback.
- **My Library:** IndexedDB audio/lyrics storage, uploads, generated-track saves, renaming, genre organization, deletion, audio downloads, and lyrics/metadata exports. Private by default. Import audio up to 25 MB. Browser data can be cleared: export backups. Handles are local labels, **not authentication**. There is no cloud account or cross-device sync.
- **Told Them listening room (`#listen`):** genre discovery and a **local catalog preview** containing only explicitly public library items. Public listening and remix permission are separate; making a track private also revokes remix permission. No actual network publication occurs.
- **Creative room (`#creative`):** server-proxied conversation, editable original lyric drafts, broad musical sound analysis (descriptions or authorized audio excerpts under 15 MB), and text storyboards. Optional browser voice transcription; microphone use is opt-in and may use a browser-provider service. Reference audio is sent to the configured AI provider, not saved to the library. Genre/tempo estimates are uncertain—not song/artist identification or proof of rights.
- **Mashup & vocals:** a real offline Web Audio overlay mixer for owned audio or explicitly remix-permitted public items. Import a backing track and a separate vocal stem to add vocals. Exports are capped at 2:48, start both sources at zero, and blend their levels. No automatic beat matching or stem separation.
- **Video maker:** real-time Canvas/Web Audio cover-art + spectrum WebM export from saved audio. Lyrics use supplied timestamps, or approximate line timing for untimed lyrics. Text storyboards can include original anime-inspired worlds; **generative animation/video is not connected**. Leave the page open while rendering. Browser WebM recording support is required; export errors are surfaced and audio contexts/streams are cleaned up.

Deep links: `#bands`, `#podcasts`, `#listen`, `#library`, `#creative`, and the existing workspace tabs.

## Respect and safety

Creative AI instructions redirect artist references toward general instrumentation, rhythm, genre, and mood—not copied lyrics/melodies, singer impersonation, voice cloning, or copyrighted characters. Sound references require explicit permission in both the client and server request validation. Listening access never implies a remix license. These guardrails and creator pledges are not a legal clearance service; creators remain responsible for licenses and final review.

## Still needed for a production community

1. Authenticated creator accounts, durable object storage, and a database for creations, ownership, permissions, and provenance.
2. Server-enforced publication/remix authorization, moderation, reporting, deletion, consent revocation, and real community interactions.
3. Deploy the listening frontend on a separate HTTPS origin if desired, connected to the same authorized catalog backend. Hash navigation is currently a linked local experience, **not a second deployed domain**.
4. Licensed/commissioned finished vocal and genre demo recordings, professionally recorded podcast samples, and storage/CDN delivery.
5. Connected stem-separation and generative-video services before enabling vocal removal or animated music-video production.
6. Real distribution/scheduling integrations. Existing platform-publish toggles, praise feed, and weekly schedule settings are UI/demo state, not verified external publication or automated scheduling.

## Tests

`npm test` runs five Playwright checks covering all WAV lengths/variation differences, API permission validation, playback, IndexedDB persistence, visibility/remix controls, audio imports/mixing, mocked AI lyric handoff, mobile overflow, unconfigured-service behavior, and actual WebM download. Live AI, browser speech synthesis, and voice transcription are not exercised.

The test browser is distributed through npm (`@sparticuz/chromium`); the config extracts bundled Linux libraries into the OS temporary directory. Linux x64 is the sandbox target. Set `CHROMIUM_EXECUTABLE_PATH` for your own compatible browser on other systems. Test recordings/screenshots and build outputs are ignored by Git.
