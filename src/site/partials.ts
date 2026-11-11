/**
 * Shared HTML fragments for the marketing and legal pages.
 *
 * The pages are plain static HTML (fast, indexable, readable without JavaScript). Anything that
 * repeats across them is written once here and stamped in by the Vite plugin in vite.config.ts,
 * which replaces `<!--@name-->` markers at dev and build time.
 *
 * This module runs in Node only (build and dev server); never import it from browser code.
 */
import { CREDIT_COSTS, PLANS, PRICING_STATUS, TOP_UP, annualPerMonth, annualSaving, songsPerMonth, type Plan } from '../config/plans';
import { SITE } from '../config/site';

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const svg = (paths: string, cls = 'icon'): string =>
  `<svg class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Line icons (24px grid, stroke only) so the pages need no icon library. */
export const ICONS = {
  audioLines: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
} as const;

export const icon = (name: keyof typeof ICONS, cls?: string): string => svg(ICONS[name], cls);

const money = (n: number): string => `$${n}`;

// ---------------------------------------------------------------------------------- head

/** Tags every marketing page needs. The `tt-head` marker is filled per request by the server. */
function siteHead(): string {
  return [
    '<meta name="theme-color" content="#0b1120">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Tell Them">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="/src/site/site.css">',
    // Marks the page as script-enabled before first paint, so the phone menu never flashes open.
    "<script>document.documentElement.classList.add('js')</script>",
    '<meta name="tt-head" content="">',
  ].join('\n    ');
}

// -------------------------------------------------------------------------------- chrome

function siteHeader(page: string): string {
  const link = (href: string, label: string, id?: string) =>
    `<a href="${href}"${id && id === page ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap site-header-inner">
        <a class="wordmark" href="/" aria-label="${esc(SITE.name)} home">${icon('audioLines', 'wordmark-icon')}<span>${esc(SITE.name)}</span></a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">${icon('menu')}<span>Menu</span></button>
        <nav id="site-nav" class="site-nav" aria-label="Site">
          ${link('/#formats', 'What you can make')}
          ${link('/#how', 'How it works')}
          ${link('/pricing', 'Pricing', 'pricing')}
          ${link('/showcase', 'Showcase')}
          <a class="btn btn-primary btn-sm" href="/studio">Open the studio</a>
        </nav>
      </div>
    </header>`;
}

function siteFooter(): string {
  return `<footer class="site-footer">
      <div class="wrap site-footer-grid">
        <div class="site-footer-brand">
          <a class="wordmark" href="/">${icon('audioLines', 'wordmark-icon')}<span>${esc(SITE.name)}</span></a>
          <p>${esc(SITE.tagline)} Original music, podcasts and radio spots from a few words, always labeled as AI-made.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <a href="/studio">Studio</a>
          <a href="/showcase">Community showcase</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <nav aria-label="Make">
          <h2>Make</h2>
          <a href="/studio#bands">A song</a>
          <a href="/studio#podcasts">A podcast</a>
          <a href="/studio#commercials">A radio spot</a>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <a href="/terms">Terms of use</a>
          <a href="/privacy">Privacy</a>
          <a href="/refunds">Refunds</a>
        </nav>
      </div>
      <div class="wrap site-footer-base">
        <p>&copy; ${new Date().getFullYear()} ${esc(SITE.legal.entityName || SITE.name)}. Music and voices are generated with Google's Gemini and Lyria models.</p>
      </div>
    </footer>`;
}

// ------------------------------------------------------------------------------- pricing

function planPrice(plan: Plan): string {
  const perMonth = annualPerMonth(plan);
  const annualAttrs =
    perMonth === null
      ? ''
      : ` data-monthly="${money(plan.monthly)}" data-annual="${money(perMonth)}"`;
  const billingAttrs =
    plan.annual === null
      ? ''
      : ` data-monthly="Billed monthly" data-annual="${money(plan.annual)} billed yearly, save ${annualSaving(plan)}%"`;
  const billing = plan.monthly === 0 ? 'No card needed' : plan.annual === null ? 'Billed monthly' : 'Billed monthly';
  return `<p class="plan-price"><span class="plan-amount"${annualAttrs}>${money(plan.monthly)}</span><span class="plan-per">/month</span></p>
          <p class="plan-billing"${billingAttrs}>${billing}</p>`;
}

function planCta(plan: Plan): string {
  if (plan.id === 'free') return '<a class="btn btn-primary" href="/studio">Start free</a>';
  return PRICING_STATUS.onSale
    ? `<a class="btn btn-secondary" href="/studio">Choose ${esc(plan.name)}</a>`
    : '<span class="btn btn-disabled" aria-disabled="true">Coming soon</span>';
}

function pricingCards(): string {
  const cards = PLANS.map(
    (plan) => `<article class="plan${plan.recommended ? ' plan-recommended' : ''}" data-plan="${plan.id}">
          ${plan.recommended ? '<p class="plan-flag">Recommended</p>' : ''}
          <h3>${esc(plan.name)}</h3>
          <p class="plan-tagline">${esc(plan.tagline)}</p>
          ${planPrice(plan)}
          <p class="plan-credits"><strong>${plan.credits} credits</strong> a month, about ${songsPerMonth(plan)} songs</p>
          <ul class="plan-features">
            ${plan.features.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('\n            ')}
          </ul>
          ${planCta(plan)}
        </article>`
  ).join('\n        ');
  return `<div class="plans">
        ${cards}
      </div>`;
}

/** Short version for the landing page: name, price and allowance only. */
function pricingCompact(): string {
  return `<div class="plans-compact">
        ${PLANS.map(
          (plan) => `<a class="plan-mini${plan.recommended ? ' plan-recommended' : ''}" href="/pricing" data-plan="${plan.id}">
          <span class="plan-mini-name">${esc(plan.name)}</span>
          <span class="plan-mini-price">${money(plan.monthly)}<small>/month</small></span>
          <span class="plan-mini-credits">${plan.credits} credits, about ${songsPerMonth(plan)} songs</span>
        </a>`
        ).join('\n        ')}
      </div>`;
}

function creditTable(): string {
  return `<table class="credit-table">
        <caption>What one render uses</caption>
        <thead><tr><th scope="col">You make</th><th scope="col">Credits</th></tr></thead>
        <tbody>
          ${CREDIT_COSTS.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td>${c.credits}</td></tr>`).join('\n          ')}
          <tr><th scope="row">Lyric or visualizer video export</th><td>Free</td></tr>
          <tr><th scope="row">Lyrics help from the creative assistant</th><td>Free</td></tr>
        </tbody>
      </table>`;
}

function topUp(): string {
  return `<p class="topup"><strong>Need a few more?</strong> A one-time pack of ${TOP_UP.credits} credits is ${money(TOP_UP.price)}, with no subscription. Pack credits stay valid for ${TOP_UP.validMonths} months.</p>`;
}

/** Monthly / yearly switch. The saving shown is the best one any plan offers. */
function billingToggle(): string {
  const best = Math.max(...PLANS.map(annualSaving));
  return `<div class="billing-toggle" role="group" aria-label="Billing period">
        <button type="button" data-billing="monthly" aria-pressed="true">Monthly</button>
        <button type="button" data-billing="annual" aria-pressed="false">Yearly${best > 0 ? ` <small>save up to ${best}%</small>` : ''}</button>
      </div>`;
}

const pricingNotice = (): string =>
  PRICING_STATUS.onSale ? '' : `<p class="notice" role="note">${esc(PRICING_STATUS.notice)}</p>`;

// --------------------------------------------------------------------------------- legal

function legalBanner(): string {
  return SITE.legal.reviewed
    ? ''
    : '<p class="notice notice-draft" role="note"><strong>Draft.</strong> This page is a working draft that has not had legal review and is not yet in force. It describes how the preview works today.</p>';
}

function legalContact(): string {
  const email = SITE.legal.contactEmail;
  return email
    ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
    : 'our contact address, which will be published here before paid plans open';
}

// -------------------------------------------------------------------------------- expand

/** Replaces every `<!--@name-->` marker in a page. `pagePath` is the page's file path. */
export function expandSitePartials(html: string, pagePath: string): string {
  const page = pagePath.replace(/^.*\//, '').replace(/\.html$/, '') || 'index';
  const partials: Record<string, string> = {
    head: siteHead(),
    header: siteHeader(page),
    footer: siteFooter(),
    'pricing-cards': pricingCards(),
    'pricing-compact': pricingCompact(),
    'pricing-notice': pricingNotice(),
    'billing-toggle': billingToggle(),
    'credit-table': creditTable(),
    topup: topUp(),
    'legal-banner': legalBanner(),
    'legal-contact': legalContact(),
    'legal-entity': esc(SITE.legal.entityName || SITE.name),
    'legal-updated': esc(SITE.legal.lastUpdated),
    'legal-law': esc(SITE.legal.governingLaw || 'the jurisdiction named here before launch'),
  };
  return html.replace(/<!--@([a-z-]+)-->/g, (marker, name: string) => (name in partials ? partials[name] : marker));
}
