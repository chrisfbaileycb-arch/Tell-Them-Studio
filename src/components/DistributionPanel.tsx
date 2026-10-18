import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryTrack } from '../utils/libraryStore';
import {
  addEpisode,
  createShow,
  createWebhook,
  deleteShow,
  deleteWebhook,
  ensureSession,
  fetchSession,
  getShowSchedule,
  isOk,
  listEpisodes,
  listShows,
  listWebhookDeliveries,
  listWebhooks,
  publishEpisodeNow,
  putShowSchedule,
  removeEpisode,
  scheduleEpisode,
  setWebhookActive,
  testWebhook,
  unscheduleEpisode,
  type CatalogResult,
} from '../utils/catalogClient';
import type {
  EpisodeView,
  PublicShow,
  ShowScheduleResponse,
  WebhookDelivery,
  WebhookEndpoint,
} from '../types/distribution';

type Phase = 'checking' | 'unavailable' | 'signed-out' | 'ready';
type Hook = Omit<WebhookEndpoint, 'creatorId'>;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Directories that ingest an RSS feed URL. We never hold credentials for any of them. */
const DIRECTORIES = [
  { name: 'Apple Podcasts', href: 'https://podcastsconnect.apple.com/' },
  { name: 'Spotify for Creators', href: 'https://creators.spotify.com/' },
  { name: 'YouTube Studio', href: 'https://studio.youtube.com/' },
  { name: 'Amazon Music for Podcasters', href: 'https://podcasters.amazon.com/' },
];

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const failure = <T,>(r: CatalogResult<T>) => (isOk(r) ? '' : r.message);

/**
 * Real distribution for podcasts: a public RSS feed per show, a weekly schedule that a server
 * worker honours, and signed webhooks. Everything here needs the community service; when it is
 * unreachable the panel says so and the rest of the studio keeps working offline.
 */
export function DistributionPanel({ owner, tracks }: { owner: string; tracks: LibraryTrack[] }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [notice, setNotice] = useState('');
  const [shows, setShows] = useState<PublicShow[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, h] = await Promise.all([listShows(), listWebhooks()]);
    if (isOk(s)) setShows(s.data);
    if (isOk(h)) setHooks(h.data);
  }, []);

  const probe = useCallback(async () => {
    const session = await fetchSession();
    if (isOk(session)) {
      setPhase('ready');
      await refresh();
    } else if (session.reason === 'unauthorized') {
      setPhase('signed-out');
    } else {
      setPhase('unavailable');
    }
  }, [refresh]);

  useEffect(() => {
    void probe();
  }, [probe, owner]);

  const connect = async () => {
    setBusy(true);
    const res = await ensureSession(owner);
    setBusy(false);
    if (isOk(res)) {
      setNotice('');
      await probe();
    } else {
      setNotice(res.message);
    }
  };

  return (
    <section className="cw-panel" aria-label="Podcast feeds and webhooks" data-testid="distribution-panel">
      <div className="cw-heading">
        <div>
          <h2>Podcast feeds &amp; webhooks</h2>
          <p>
            Publish a real RSS feed, schedule weekly episodes, and notify your own services. Studio never holds your
            platform logins: you submit the feed URL to each directory yourself.
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="cw-note" data-testid="distribution-notice">
          {notice}
        </p>
      )}
      {phase === 'checking' && <p className="cw-note">Checking the community service…</p>}
      {phase === 'unavailable' && (
        <p className="cw-note" data-testid="distribution-unavailable">
          Feeds and webhooks need the community service, which is not reachable right now. Your library, exports and the
          manual handoff checklist still work offline.
        </p>
      )}
      {phase === 'signed-out' && (
        <div className="cw-actions">
          <p className="cw-note">Connect as {owner} to create a show and its public feed.</p>
          <button type="button" disabled={busy} onClick={connect} data-testid="distribution-connect">
            {busy ? 'Connecting…' : `Connect as ${owner}`}
          </button>
        </div>
      )}
      {phase === 'ready' && (
        <>
          <ShowsSection shows={shows} tracks={tracks} onChange={refresh} setNotice={setNotice} />
          <WebhooksSection hooks={hooks} onChange={refresh} setNotice={setNotice} />
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- shows

function ShowsSection({
  shows,
  tracks,
  onChange,
  setNotice,
}: {
  shows: PublicShow[];
  tracks: LibraryTrack[];
  onChange: () => Promise<void>;
  setNotice: (s: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createShow({ title: title.trim(), description: description.trim() });
    setBusy(false);
    if (isOk(res)) {
      setTitle('');
      setDescription('');
      setNotice(`Created “${res.data.title}”. Its feed is ready to submit.`);
      await onChange();
    } else {
      setNotice(res.message);
    }
  };

  return (
    <div className="space-y-4" data-testid="shows-section">
      <h3>Shows</h3>
      <form aria-label="Create a show" onSubmit={create} className="cw-row">
        <label>
          Show title
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || title.trim().length < 3}>
          Create show
        </button>
      </form>
      {!shows.length && <p className="cw-note">No shows yet. A show groups episodes into one RSS feed.</p>}
      {shows.map((show) => (
        <ShowCard key={show.id} show={show} tracks={tracks} onChange={onChange} setNotice={setNotice} />
      ))}
    </div>
  );
}

function ShowCard({
  show,
  tracks,
  onChange,
  setNotice,
}: {
  show: PublicShow;
  tracks: LibraryTrack[];
  onChange: () => Promise<void>;
  setNotice: (s: string) => void;
}) {
  const [episodes, setEpisodes] = useState<EpisodeView[]>([]);
  const [schedule, setSchedule] = useState<ShowScheduleResponse | null>(null);
  const [day, setDay] = useState(4);
  const [time, setTime] = useState('09:00');
  const [zone, setZone] = useState(browserTimezone());
  const [pick, setPick] = useState('');

  const reload = useCallback(async () => {
    const [eps, sch] = await Promise.all([listEpisodes(show.id), getShowSchedule(show.id)]);
    if (isOk(eps)) setEpisodes(eps.data);
    if (isOk(sch)) {
      setSchedule(sch.data);
      if (sch.data.schedule) {
        setDay(sch.data.schedule.dayOfWeek);
        setTime(sch.data.schedule.timeOfDay);
        setZone(sch.data.schedule.timezone);
      }
    }
  }, [show.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inShow = useMemo(() => new Set(episodes.map((e) => e.creationId)), [episodes]);
  const eligible = tracks.filter((t) => t.kind === 'podcast' && t.remoteId && !t.consentWithdrawnAt && !inShow.has(t.remoteId));
  const titleOf = (e: EpisodeView) => e.title;

  const run = async (label: string, job: () => Promise<CatalogResult<unknown>>) => {
    const res = await job();
    setNotice(isOk(res) ? label : failure(res));
    await reload();
    await onChange();
  };

  const saveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    void run('Weekly schedule saved.', () => putShowSchedule(show.id, { dayOfWeek: day, timeOfDay: time, timezone: zone }));
  };

  return (
    <article className="cw-track" data-testid="show-card" aria-label={`Show ${show.title}`}>
      <div className="cw-track-main">
        <h4>{show.title}</h4>
        <p className="cw-note">
          {show.publishedEpisodes} published episode{show.publishedEpisodes === 1 ? '' : 's'}
        </p>
        <label>
          Public RSS feed
          <input readOnly value={show.feedUrl} data-testid="feed-url" onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className="cw-actions">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(show.feedUrl);
                setNotice('Feed URL copied.');
              } catch {
                setNotice('Select the feed URL and copy it manually.');
              }
            }}
          >
            Copy feed URL
          </button>
          <a href={show.feedUrl} target="_blank" rel="noopener noreferrer">
            Open feed ↗
          </a>
        </div>
        <p className="cw-note">
          Submit this URL yourself — nothing is sent to these services for you:{' '}
          {DIRECTORIES.map((d, i) => (
            <React.Fragment key={d.name}>
              {i > 0 && ' · '}
              <a href={d.href} target="_blank" rel="noopener noreferrer">
                {d.name}
              </a>
            </React.Fragment>
          ))}
        </p>

        <form aria-label={`Weekly schedule for ${show.title}`} onSubmit={saveSchedule} className="cw-row">
          <label>
            Day
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label>
            Time zone
            <input value={zone} onChange={(e) => setZone(e.target.value)} required />
          </label>
          <button type="submit">Save weekly schedule</button>
        </form>
        <p className="cw-note" data-testid="next-slot">
          {schedule?.nextRunAt ? `Next weekly slot: ${fmt(schedule.nextRunAt)}` : 'No active weekly schedule yet.'}
        </p>

        <h5>Episodes</h5>
        {!episodes.length && <p className="cw-note">Add a synced podcast from your library below.</p>}
        <ul className="space-y-2">
          {episodes.map((ep) => (
            <li key={ep.creationId} data-testid="episode-row">
              <strong>
                #{ep.episodeNumber} {titleOf(ep)}
              </strong>{' '}
              <span data-testid="episode-state">
                {ep.publishState === 'scheduled'
                  ? `scheduled ${fmt(ep.scheduledFor)}`
                  : ep.publishState === 'published'
                    ? `published ${fmt(ep.publishedAt)}`
                    : 'draft'}
              </span>
              {ep.holdReason && <span role="alert"> — held: {ep.holdReason}</span>}
              <div className="cw-actions">
                {ep.publishState !== 'published' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void run('Episode published to the feed.', async () => {
                          const r = await publishEpisodeNow(show.id, ep.creationId);
                          if (isOk(r) && !r.data.published) {
                            return { ok: false, reason: 'rejected', message: `Held for review: ${r.data.reason ?? 'moderation'}` };
                          }
                          return r;
                        })
                      }
                    >
                      Publish now
                    </button>
                    <button
                      type="button"
                      disabled={!schedule?.schedule}
                      title={schedule?.schedule ? undefined : 'Save a weekly schedule first'}
                      onClick={() =>
                        void run('Scheduled at the next free weekly slot.', () =>
                          scheduleEpisode(show.id, ep.creationId, { useSchedule: true })
                        )
                      }
                    >
                      Schedule next slot
                    </button>
                  </>
                )}
                {ep.publishState === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => void run('Schedule cancelled.', () => unscheduleEpisode(show.id, ep.creationId))}
                  >
                    Unschedule
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void run('Removed from the show.', () => removeEpisode(show.id, ep.creationId))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="cw-row">
          <label>
            Add podcast from library
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={!eligible.length}>
              <option value="">{eligible.length ? 'Choose a podcast…' : 'No synced podcasts available'}</option>
              {eligible.map((t) => (
                <option key={t.id} value={t.remoteId}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!pick}
            onClick={() => {
              void run('Episode added as a draft.', () => addEpisode(show.id, pick));
              setPick('');
            }}
          >
            Add episode
          </button>
        </div>
        <div className="cw-actions">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete “${show.title}” and its feed? Episodes stay in your library.`)) return;
              void run('Show deleted.', () => deleteShow(show.id));
            }}
          >
            Delete show
          </button>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- webhooks

function WebhooksSection({
  hooks,
  onChange,
  setNotice,
}: {
  hooks: Hook[];
  onChange: () => Promise<void>;
  setNotice: (s: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createWebhook(url.trim());
    if (isOk(res)) {
      setSecret({ id: res.data.endpoint.id, value: res.data.secret });
      setUrl('');
      setNotice('Webhook created. Copy the signing secret now — it is shown only once.');
      await onChange();
    } else {
      setNotice(res.message);
    }
  };

  const loadDeliveries = async (id: string) => {
    const res = await listWebhookDeliveries(id);
    if (isOk(res)) setDeliveries((d) => ({ ...d, [id]: res.data }));
  };

  return (
    <div className="space-y-4" data-testid="webhooks-section">
      <h3>Webhooks</h3>
      <p className="cw-note">
        Studio will POST signed JSON (<code>X-TellThem-Signature</code>) to your HTTPS endpoint when a creation or
        episode is published, unpublished or revoked. Failed deliveries retry with backoff.
      </p>
      <form aria-label="Add a webhook" onSubmit={create} className="cw-row">
        <label>
          Endpoint URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" required />
        </label>
        <button type="submit">Add webhook</button>
      </form>
      {secret && (
        <div role="status" data-testid="webhook-secret" className="cw-note">
          Signing secret: <code>{secret.value}</code>{' '}
          <button type="button" onClick={() => setSecret(null)}>
            I saved it
          </button>
        </div>
      )}
      {!hooks.length && <p className="cw-note">No webhooks yet.</p>}
      <ul className="space-y-2">
        {hooks.map((h) => (
          <li key={h.id} data-testid="webhook-row">
            <code>{h.url}</code> · {h.active ? 'active' : 'paused'}
            <div className="cw-actions">
              <button
                type="button"
                onClick={async () => {
                  const r = await testWebhook(h.id);
                  setNotice(isOk(r) ? 'Test ping queued.' : r.message);
                  setTimeout(() => void loadDeliveries(h.id), 1200);
                }}
              >
                Send test
              </button>
              <button type="button" onClick={() => void loadDeliveries(h.id)}>
                Recent deliveries
              </button>
              <button
                type="button"
                onClick={async () => {
                  await setWebhookActive(h.id, !h.active);
                  await onChange();
                }}
              >
                {h.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Delete this webhook?')) return;
                  await deleteWebhook(h.id);
                  await onChange();
                }}
              >
                Delete
              </button>
            </div>
            {deliveries[h.id] && (
              <ul className="cw-note" data-testid="delivery-list">
                {deliveries[h.id].length === 0 && <li>No deliveries yet.</li>}
                {deliveries[h.id].slice(0, 8).map((d) => (
                  <li key={d.id}>
                    {d.event} · {d.status} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                    {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}
                    {d.lastError ? ` · ${d.lastError}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
