# Tell Them Studio visual QA

final result: passed

## Evidence and state

- Visual truth: `docs/design/approved-direction.webp`, the user's approved revision of option 2 (music-first dark studio with concert guitar artwork).
- Implementation: `docs/design/music-desktop.webp` and `docs/design/music-mobile.webp`.
- Cloud-browser evidence: `docs/design/cloud-preview.webp`, captured after inspecting the running application at the local preview service.
- Source pixels: 1487 × 1058. Desktop CSS viewport and capture: 1440 × 1024, deviceScaleFactor 1. Source was normalized to 1440 × 1024 for comparison, preserving its practically identical aspect ratio.
- Mobile: 390 × 844 CSS viewport, deviceScaleFactor 1; full-page capture.
- Cloud browser: 1363 × 936 viewport. This smaller viewport scrolls normally; the complete creation action is visible in the 1440 × 1024 design target.
- State: Music, Rock, Duet, 2:48, collapsed advanced settings, paused audio. Existing audio is a real eight-second synthesized demo, not the mockup's fictional 2:48 recording.
- Full-view comparison: source and implementation composited side by side in `test-results/design-comparison.webp` and directly inspected.
- Focused comparison: genre, vocal, length, fine-tuning, and primary-action regions composited side by side in `test-results/controls-comparison.webp` and directly inspected.

## Required fidelity surfaces

- Typography: Geist with Plus Jakarta/system fallbacks; strong 68px desktop title, readable 19px brief, 14–16px controls. Heading, weight, wrapping, and hierarchy follow the source. Two-column proportions and line lengths are preserved. Mobile title and controls scale and wrap.
- Layout: dark full-page workbench, compact horizontal navigation, wide composition column, slim divider and square artwork column. Primary action fits the 1440 × 1024 target. Mobile stacks the artwork after the creation controls without horizontal overflow or clipped buttons.
- Tokens: navy background #0d1422, panel #151e2e, muted blue-grey text, violet selection outlines, violet-to-pink primary action. All secondary screens inherit coherent dark surfaces, focus treatments, and readable field colors.
- Images: generated original electric guitar concert artwork, violet/magenta/blue stage lighting, sharp square crop, optimized WebP. Existing Lucide icons match the reference's outlined instrument and audio icon style. The audio waveform is calculated from the playable audio, not decorative invented data.
- Copy: Music Studio and Create music lead. Genres and vocal styles are visible. Short clips remain available; podcasts, commercial audio, and seasonal templates remain supporting capabilities. Existing real track names and durations replace fictional mockup values. Drafts remain browser-local.

## Comparison history and resolved issues

1. Initial browser inspection found the primary player used native audio controls rather than the approved custom waveform treatment (P2). Added a real decoded-audio waveform, accessible play/pause and seek controls, measured duration, and native-controls fallback. Updated desktop capture and focused comparison confirm the fix.
2. Mobile inspection found the long guidelines label unnecessarily wrapped the header (P3). Shortened it to Guidelines and retained the full dialog.
3. Final comparison found no outstanding P0/P1/P2 issues. Different demo title, actual eight-second duration, waveform shape, missing fictional profile circle, and retained handle/guidelines controls are intentional adaptations to working product behavior, not simulated functionality.

## Interaction and console checks

- Cloud browser: switched Rock to Pop and back; verified selected genre/vocal states; changed target length; played, paused, and keyboard-seeked actual demo audio; verified artwork loaded.
- Automated Chromium: 11 passing checks including all genre sketches, permissions, playback, IndexedDB persistence, uploads/mixing, real WebM export, draft restoration, independent assistant conversations, lyric handoff, manual upload checklist, custom genre blends, vocal modes, responsive geometry, and mocked generation through save-to-library.
- TypeScript and production build pass.
- Application page-error listener reported no uncaught application exceptions in the new workflow test. Cloud console also contained development preview WebSocket and browser-extension metadata warnings; these were tooling messages, not failed product interactions. Preview-only HMR is disabled when started with the strict preview flag.
- Live paid AI calls, browser speech recognition, and browser speech synthesis were not exercised.

## Follow-up polish

- Further font and small spacing refinements can follow user feedback.
- Existing production build reports a large JavaScript bundle; code splitting is a separate performance task.
- No deployment or main-branch merge is included in this visual-polish change.
