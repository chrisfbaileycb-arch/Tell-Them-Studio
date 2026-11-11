/**
 * Progressive enhancement for the marketing pages. Plain DOM code, no framework: every page
 * is readable and navigable without it.
 */

// ------------------------------------------------------------------------- phone menu
const navToggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
const siteNav = document.getElementById('site-nav');
if (navToggle && siteNav) {
  const setOpen = (open: boolean) => {
    siteNav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  navToggle.addEventListener('click', () => setOpen(!siteNav.classList.contains('is-open')));
  siteNav.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

// ---------------------------------------------------------------- hero: idea composer
// The studio keeps its drafts in localStorage under this prefix (see src/hooks/useDraft.ts), so
// an idea typed here is waiting in the studio's brief when the visitor arrives.
const DRAFT_PREFIX = 'tell-them-draft-v1:';

function handIdeaToStudio(idea: string): void {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}prompt`, JSON.stringify(idea));
    localStorage.setItem(`${DRAFT_PREFIX}isPromptManual`, 'true');
    localStorage.setItem(`${DRAFT_PREFIX}isHelperOpen`, 'false');
  } catch {
    /* Storage unavailable (private mode): the studio simply opens with its default brief. */
  }
}

const composer = document.querySelector<HTMLFormElement>('#composer');
const ideaField = document.querySelector<HTMLTextAreaElement>('#idea');
if (composer && ideaField) {
  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const idea = ideaField.value.trim();
    if (idea) handIdeaToStudio(idea);
    window.location.assign('/studio#bands');
  });

  composer.querySelectorAll<HTMLButtonElement>('[data-idea]').forEach((chip) => {
    chip.addEventListener('click', () => {
      ideaField.value = chip.dataset.idea ?? '';
      ideaField.focus();
    });
  });

  // Rotate the example in the empty field so visitors see the range of things to ask for.
  const examples = [
    'A birthday song for Mom, who never missed a single recital',
    'A thank-you for the neighbors who shoveled our walk all winter',
    'An anthem for our hometown, the river and Friday night lights',
    'A 30-second jingle for our Saturday farmers’ market',
  ];
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let index = 0;
    window.setInterval(() => {
      if (ideaField.value || document.activeElement === ideaField) return;
      index = (index + 1) % examples.length;
      ideaField.placeholder = examples[index];
    }, 4000);
  }
}

// ----------------------------------------------------------- landing: community feed
interface FeedItem {
  id: string;
  title: string;
  creatorHandle: string;
  genre: string;
  provenance?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function glyph(className: string, pathData: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

/** Stable colour per track, so the tiles differ without loading artwork. */
function hueFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function feedMessage(root: HTMLElement, state: string, text: string, linkText: string, href: string): void {
  root.dataset.state = state;
  const message = document.createElement('p');
  message.className = 'feed-status';
  message.append(`${text} `);
  const link = document.createElement('a');
  link.href = href;
  link.textContent = linkText;
  message.append(link);
  root.replaceChildren(message);
}

async function loadCommunityFeed(): Promise<void> {
  const root = document.getElementById('community-feed');
  const audio = document.getElementById('community-audio') as HTMLAudioElement | null;
  if (!root || !audio) return;

  let items: FeedItem[];
  try {
    const response = await fetch('/api/creations?limit=6', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { items?: FeedItem[] };
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    feedMessage(root, 'error', 'The community catalog is not reachable right now. You can still make something of your own.', 'Open the studio', '/studio');
    return;
  }

  if (items.length === 0) {
    feedMessage(root, 'empty', 'Nothing has been published yet. Be the first: make something and publish it to the showcase.', 'Open the studio', '/studio');
    return;
  }

  let playingId: string | null = null;
  const cards = new Map<string, HTMLElement>();
  const mark = (id: string | null) => {
    playingId = id;
    cards.forEach((card, cardId) => {
      const active = cardId === id;
      card.dataset.playing = String(active);
      const button = card.querySelector('button');
      const title = card.dataset.title ?? 'track';
      button?.setAttribute('aria-label', `${active ? 'Pause' : 'Play'} ${title}`);
    });
  };

  audio.addEventListener('ended', () => mark(null));
  audio.addEventListener('pause', () => {
    if (audio.ended || audio.paused) mark(null);
  });

  root.replaceChildren(
    ...items.map((item) => {
      const card = document.createElement('article');
      card.className = 'track';
      card.dataset.title = item.title;
      card.dataset.playing = 'false';

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'track-play';
      play.style.setProperty('--hue', String(hueFor(item.id)));
      play.setAttribute('aria-label', `Play ${item.title}`);
      play.append(glyph('play', 'M7 4.5v15l13-7.5z'), glyph('pause', 'M7 5h4v14H7zM13 5h4v14h-4z'));
      play.addEventListener('click', () => {
        if (playingId === item.id) {
          audio.pause();
          return;
        }
        audio.src = `/api/creations/${encodeURIComponent(item.id)}/audio`;
        mark(item.id);
        audio.play().catch(() => mark(null));
      });

      const body = document.createElement('div');
      body.className = 'track-body';
      const heading = document.createElement('h3');
      const link = document.createElement('a');
      link.href = `/s/${encodeURIComponent(item.id)}`;
      link.textContent = item.title;
      heading.append(link);
      const meta = document.createElement('p');
      meta.className = 'track-meta';
      meta.textContent = `${item.creatorHandle} · ${item.genre}`;
      body.append(heading, meta);
      if (item.provenance) {
        const label = document.createElement('p');
        label.className = 'track-label';
        label.textContent = item.provenance;
        body.append(label);
      }

      card.append(play, body);
      cards.set(item.id, card);
      return card;
    })
  );
  root.dataset.state = 'ready';
}
void loadCommunityFeed();

// ------------------------------------------------------- pricing: monthly / yearly view
const billingButtons = document.querySelectorAll<HTMLButtonElement>('.billing-toggle button');
billingButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.billing === 'annual' ? 'annual' : 'monthly';
    billingButtons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    document.querySelectorAll<HTMLElement>('[data-monthly][data-annual]').forEach((el) => {
      el.textContent = (mode === 'annual' ? el.dataset.annual : el.dataset.monthly) ?? '';
    });
  });
});

export {};
