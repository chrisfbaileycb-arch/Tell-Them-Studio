import { useDraft } from "../hooks/useDraft";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BandArchetype, SongResult } from "../../types";
import {
  createStudioCoverSvg,
  createUniqueSongArtworkSvg,
  describeSongPictureTheme,
} from "../../constants";
import {
  GENRES,
  SampleGenre,
  SAMPLE_TITLES,
  makeGenreSample,
  mixAudio,
} from "../utils/creativeAudio";
import {
  LibraryTrack,
  SyncPatch,
  commitSyncPatch,
  loadLibrary,
  revokeRemoteCopy,
  saveTrack,
  deleteTrack,
  syncLibrary,
  syncTrackToCatalog,
  undoWithdrawal,
  withdrawConsent,
  type ConsentResult,
} from "../utils/libraryStore";
import { subscribeCreatorHandle } from "../utils/creatorHandle";
import { handleDownloadVideo } from "../utils/videoUtils";
import { DistributionPanel } from "./DistributionPanel";
import "./creative.css";

type LibraryContextValue = {
  tracks: LibraryTrack[];
  put: (track: LibraryTrack) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Withdraws consent on the server (cascading to remixes) and refreshes local state. */
  withdraw: (track: LibraryTrack, mode: "soft" | "hard") => Promise<ConsentResult>;
  undoWithdraw: (track: LibraryTrack) => Promise<ConsentResult>;
  error: string;
};
const LibraryContext = createContext<LibraryContextValue>(null!);
const SYNC_FIELDS = [
  "remoteId",
  "remoteSignature",
  "remotePublished",
  "syncState",
  "syncMessage",
  "syncFailedKey",
  "moderationHold",
  "remoteRemixPermitted",
] as const;
const patchChangesTrack = (t: LibraryTrack, patch: SyncPatch) =>
  SYNC_FIELDS.some((k) => t[k] !== patch[k]);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]),
    [error, setError] = useState("");
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const mounted = useRef(true);
  // Network work is serialised so overlapping edits cannot interleave their uploads.
  const syncChain = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (job: () => Promise<void>) => {
    syncChain.current = syncChain.current.then(job).catch(() => undefined);
  };
  const syncOne = (track: LibraryTrack) =>
    enqueue(async () => {
      const patch = await syncTrackToCatalog(track);
      if (!patch || !patchChangesTrack(track, patch)) return;
      const saved = await commitSyncPatch(track.id, patch);
      if (saved && mounted.current)
        setTracks((old) => old.map((t) => (t.id === track.id ? { ...t, ...patch } : t)));
    });
  const syncAll = () =>
    enqueue(async () => {
      const merged = await syncLibrary();
      if (mounted.current) setTracks(merged);
    });
  useEffect(() => {
    mounted.current = true;
    loadLibrary()
      .then((local) => {
        setTracks(local);
        syncAll();
      })
      .catch((e) => setError(e.message));
    // Re-sync when the creator picks a different handle or the network returns.
    const stopHandle = subscribeCreatorHandle(syncAll);
    window.addEventListener("online", syncAll);
    return () => {
      mounted.current = false;
      stopHandle();
      window.removeEventListener("online", syncAll);
    };
  }, []);
  const put = async (track: LibraryTrack) => {
    // Reflect edits immediately; roll back to durable storage if a write fails.
    setTracks((old) => [track, ...old.filter((t) => t.id !== track.id)]);
    try {
      await saveTrack(track);
    } catch (e) {
      try {
        setTracks(await loadLibrary());
      } catch {
        setError("Browser storage is unavailable. Edits may not be saved.");
      }
      throw e;
    }
    // Local save succeeded; mirroring to the live catalog is best-effort in the background.
    syncOne(track);
  };
  const remove = async (id: string) => {
    const track = tracksRef.current.find((t) => t.id === id);
    await deleteTrack(id);
    setTracks((old) => old.filter((t) => t.id !== id));
    if (track?.remoteId) enqueue(async () => void (await revokeRemoteCopy(track)));
  };
  // Consent changes are awaited by the caller but still serialised with pending syncs.
  const runConsent = (job: () => Promise<ConsentResult>) =>
    new Promise<ConsentResult>((resolve) => {
      enqueue(async () => {
        const result = await job().catch(
          () => ({ ok: false, message: "The community service could not be reached." }) as ConsentResult,
        );
        if (mounted.current) setTracks(await loadLibrary().catch(() => tracksRef.current));
        resolve(result);
      });
    });
  const withdraw = (track: LibraryTrack, mode: "soft" | "hard") =>
    runConsent(() => withdrawConsent(track, mode));
  const undoWithdraw = (track: LibraryTrack) => runConsent(() => undoWithdrawal(track));
  return (
    <LibraryContext.Provider value={{ tracks, put, remove, withdraw, undoWithdraw, error }}>
      {children}
    </LibraryContext.Provider>
  );
}
const useLibrary = () => useContext(LibraryContext);
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
function Player({ audio }: { audio: Blob }) {
  const url = useBlobUrl(audio);
  return (
    <audio
      controls
      preload="metadata"
      src={url || undefined}
      onPlay={(e) => {
        document.querySelectorAll("audio").forEach((a) => {
          if (a !== e.currentTarget) a.pause();
        });
        window.speechSynthesis?.cancel();
      }}
    />
  );
}
const SYNC_LABELS: Record<string, string> = {
  synced: "Synced",
  pending: "Sync pending",
  failed: "Not published",
  local: "Local only",
};
const makeTrack = (
  title: string,
  genre: string,
  audio: Blob,
  source: LibraryTrack["source"],
  owner: string,
): LibraryTrack => ({
  id: crypto.randomUUID(),
  title,
  genre,
  audio,
  source,
  owner,
  kind: "music",
  lyrics: "",
  createdAt: new Date().toISOString(),
  visibility: "private",
  remixAllowed: false,
  coverImageUrl: createUniqueSongArtworkSvg({
    title,
    genre,
    creatorHandle: owner,
    seed: `${title}-${genre}-${owner}`,
    motif: "band",
  }),
});

export function SaveCreations({
  results,
  owner,
}: {
  results: SongResult[];
  owner: string;
}) {
  const { tracks, put } = useLibrary();
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const mine = results.filter(
    (r) =>
      !r.id.startsWith("seed-") &&
      r.creatorHandle === owner &&
      r.status === "completed" &&
      r.audioUrl,
  );
  if (!mine.length) return null;
  return (
    <section className="cw cw-save">
      <h3>Keep your creations</h3>
      <p>
        Save generated audio and lyrics to your private, browser-stored library.
        Export a backup before clearing browser data.
      </p>
      {mine.map((result) => (
        <button
          disabled={busy || tracks.some((t) => t.id === result.id)}
          key={result.id}
          onClick={async () => {
            setBusy(true);
            try {
              const response = await fetch(result.audioUrl!);
              if (!response.ok) throw new Error("Could not read this audio.");
              const trackGenre = result.customGenreName || result.bandType;
              await put({
                ...makeTrack(
                  result.title || "Studio creation",
                  trackGenre,
                  await response.blob(),
                  "generated",
                  owner,
                ),
                id: result.id,
                kind:
                  result.itemType === "podcast"
                    ? "podcast"
                    : result.itemType === "commercial"
                      ? "commercial"
                      : "music",
                lyrics: result.lyrics,
                provenance:
                  result.originType &&
                  result.originType !== "Craft Commercial Spot"
                    ? result.originType
                    : undefined,
                coverImageUrl:
                  result.coverImageUrl ||
                  createUniqueSongArtworkSvg({
                    title: result.title || "Studio creation",
                    genre: trackGenre,
                    prompt: result.originalPrompt || result.fullPrompt || "",
                    lyrics: result.lyrics,
                    creatorHandle: owner,
                    seed: result.id,
                    motif:
                      result.itemType === "podcast"
                        ? "podcast"
                        : result.itemType === "commercial"
                          ? "commercial"
                          : "band",
                  }),
              });
              setNotice("Saved privately to My Library.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tracks.some((t) => t.id === result.id) ? "Saved" : "Save"} ·{" "}
          {result.title || "Studio creation"}
        </button>
      ))}
      <p role="status">{notice}</p>
    </section>
  );
}

function SampleCard({
  genre,
  variation,
  owner,
  onCreate,
}: {
  genre: SampleGenre;
  variation: number;
  owner: string;
  onCreate: (genre: BandArchetype, prompt: string) => void;
}) {
  const { put } = useLibrary();
  const [audio, setAudio] = useState<Blob>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const title = SAMPLE_TITLES[genre][variation];
  return (
    <article className="cw-sample">
      <div
        className={`cw-art art-${GENRES.indexOf(genre) % 4}`}
        aria-hidden="true"
      >
        <span>
          {genre === "Serenity" ? "☀" : genre === "Anime-Inspired" ? "✦" : "♫"}
        </span>
        <div className="cw-bars">
          {Array.from({ length: 20 }, (_, i) => (
            <i
              key={i}
              style={{ height: `${18 + ((i * 13 + variation * 7) % 43)}px` }}
            />
          ))}
        </div>
      </div>
      <div className="cw-sample-body">
        <small>ORIGINAL INSTRUMENTAL SKETCH · 1:00</small>
        <h3>{title}</h3>
        <p>
          {genre} ·{" "}
          {variation
            ? "A different mood, a new possibility."
            : "A little inspiration to get you started."}
        </p>
        {audio ? (
          <Player audio={audio} />
        ) : (
          <button onClick={() => setAudio(makeGenreSample(genre, variation))}>
            ▶ Load one-minute sketch
          </button>
        )}
        <div className="cw-actions">
          <button
            className="cw-link"
            onClick={() =>
              onCreate(
                genre,
                `Create an original ${genre} track with ${variation ? "reflective, spacious" : "warm, uplifting"} energy. Use new melodies and lyrics; do not copy the demo or any artist.`,
              )
            }
          >
            Make something in this direction ↗
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await put(
                  makeTrack(
                    title,
                    genre,
                    audio || makeGenreSample(genre, variation),
                    "sample",
                    owner,
                  ),
                );
                setNotice("Saved privately.");
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save sketch
          </button>
        </div>
        <p role="status">{notice}</p>
      </div>
    </article>
  );
}
const PODCAST_SCRIPTS = [
  {
    title: "The creative spark",
    text: "Welcome to The Creative Spark, a listening preview from Tell Them Studio. Today, let us start with a small question. What makes a song feel like home? Sometimes it is a gentle guitar, a familiar rhythm, or a lyric that puts an ordinary moment into words. But an original song does not need to borrow someone else’s story. Try writing down three things you noticed this morning. A light in a window. A quiet street. A conversation that stayed with you. Each one could become a verse. Give your chorus one simple feeling, then leave room for the music to breathe. If you feel stuck, ask your creative assistant for a question instead of an answer. Your own voice and your own perspective belong here. This preview uses your browser’s reading voice. Your podcast can use the studio’s configured host voices.",
  },
  {
    title: "A moment of serenity",
    text: "Welcome to A Moment of Serenity. This is a short spoken preview about gratitude, reflection, and room to breathe. Wherever you are today, you are welcome to pause. Notice one thing that brings you a little peace. Perhaps it is a familiar sound, a memory, or the kindness of someone nearby. Music can hold that feeling without telling us what we must believe or how we must feel. In our Serenity space, we make room for faith, spirituality, and quiet encouragement, across traditions and for people who simply want to reflect. What would your peaceful place sound like? Gentle piano, a soft choir, or an acoustic guitar? Let that question be the start of something original. These creative reflections are not medical advice or a promise of healing. They are an invitation to listen, to be kind, and to make room for your own story.",
  },
];
export function PodcastSamples() {
  const [speaking, setSpeaking] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return (
    <section className="cw">
      <div className="cw-heading">
        <div>
          <small>HEAR THE POSSIBILITIES</small>
          <h2>A conversation starts here.</h2>
          <p>
            Two roughly one-minute scripts, read by your browser. These are not
            recordings of the studio host voices; timing and voice vary by
            device.
          </p>
        </div>
      </div>
      <div className="cw-grid">
        {PODCAST_SCRIPTS.map((s, i) => (
          <article className="cw-panel" key={s.title}>
            <small>SPOKEN SCRIPT PREVIEW · ~1 MINUTE</small>
            <h3>{s.title}</h3>
            <button
              onClick={() => {
                if (!window.speechSynthesis) {
                  setNotice(
                    "Reading voices are unavailable in this browser. You can read the script below.",
                  );
                  return;
                }
                window.speechSynthesis.cancel();
                if (speaking === i) {
                  setSpeaking(null);
                  return;
                }
                document.querySelectorAll("audio").forEach((a) => a.pause());
                const speech = new SpeechSynthesisUtterance(s.text);
                speech.rate = 0.95;
                speech.onend = () => setSpeaking(null);
                speech.onerror = () => {
                  setSpeaking(null);
                  setNotice(
                    "Speech playback failed. Read the preview below instead.",
                  );
                };
                setSpeaking(i);
                window.speechSynthesis.speak(speech);
              }}
            >
              {speaking === i ? "■ Stop reading" : "▶ Listen to script"}
            </button>
            <details>
              <summary>Read the script</summary>
              <p>{s.text}</p>
            </details>
          </article>
        ))}
      </div>
      <p role="status">{notice}</p>
    </section>
  );
}
export function GenreSamples({
  genre,
  owner,
  onCreate,
}: {
  genre: BandArchetype;
  owner: string;
  onCreate: (genre: BandArchetype, prompt: string) => void;
}) {
  return (
    <section className="cw">
      <div className="cw-heading">
        <div>
          <small>LISTEN FIRST. MAKE IT YOURS.</small>
          <h2>
            {genre === "Serenity"
              ? "Serenity · a little room to breathe."
              : `Find your spark in ${genre}.`}
          </h2>
          <p>
            {genre === "Serenity"
              ? "Faith, spirituality, gratitude, and quiet encouragement. All traditions welcome; no promises of healing."
              : "Two musical starting points. Explore a mood, then tell your own story."}
          </p>
        </div>
        <span className="cw-pill">2 sketches · 60 seconds each</span>
      </div>
      <div className="cw-grid">
        {[0, 1].map((i) => (
          <SampleCard
            key={`${genre}-${i}`}
            genre={genre as SampleGenre}
            variation={i}
            owner={owner}
            onCreate={onCreate}
          />
        ))}
      </div>
      <p className="cw-note">
        Procedurally composed, synthesized instrumental demos—not finished band
        recordings or examples of AI singing. No artist recordings are used.
      </p>
    </section>
  );
}

export function CreativeWorkspace({
  mode,
  owner,
  onCreate,
  onPodcast,
  onLyrics,
}: {
  mode: "listen" | "library" | "creative";
  owner: string;
  onCreate: (genre: BandArchetype, prompt: string) => void;
  onPodcast: () => void;
  onLyrics: (lyrics: string) => void;
}) {
  const { tracks, put, remove, withdraw, undoWithdraw, error } = useLibrary();
  const [genre, setGenre] = useState<SampleGenre>("Rock Band"),
    [filter, setFilter] = useState("All"),
    [notice, setNotice] = useState("");
  const [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false);
  const [tool, setTool] = useDraft("creative-tool", "Creative conversation"),
    [input, setInput] = useDraft(`creative:${tool}:input`, ""),
    [reply, setReply] = useDraft(`creative:${tool}:reply`, "");
  const [messages, setMessages] = useDraft<{ role: string; text: string }[]>(
    `creative:${tool}:messages`, [],
  );
  const [first, setFirst] = useDraft("mix-first", ""),
    [second, setSecond] = useDraft("mix-second", ""),
    [balance, setBalance] = useDraft("mix-balance", 0.5),
    [mixTitle, setMixTitle] = useDraft("mix-title", "My original mix");
  const [videoId, setVideoId] = useDraft("video-track", ""),
    [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [reference, setReference] = useState<File | null>(null),
    [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [uploadGenre, setUploadGenre] = useState("Rock Band"),
    [uploadKind, setUploadKind] = useState<LibraryTrack["kind"]>("music");
  useEffect(() => () => recognitionRef.current?.abort(), []);
  const mine = tracks.filter((t) => t.owner === owner);
  const publicTracks = tracks.filter((t) => t.visibility === "public");
  const candidates = tracks.filter(
    (t) => t.owner === owner || (t.visibility === "public" && t.remixAllowed),
  );
  const visible = (mode === "listen" ? publicTracks : mine).filter(
    (t) => filter === "All" || t.genre === filter || t.kind === filter,
  );
  const task = (
    {
      "Creative conversation": "conversation",
      "Lyrics designer": "lyrics",
      "Sound discovery": "identify",
      "Music video & anime": "storyboard",
    } as Record<string, string>
  )[tool];
  const ask = async () => {
    if (!input.trim() && !reference) return;
    setBusy(true);
    setNotice("");
    try {
      let audio: { data: string; mimeType: string } | undefined;
      if (reference && tool === "Sound discovery") {
        if (!rights)
          throw new Error(
            "Confirm you have permission to analyze this reference.",
          );
        if (reference.size > 15 * 1024 * 1024)
          throw new Error("Use a short audio excerpt under 15 MB.");
        audio = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error("Could not read reference audio."));
          reader.onload = () =>
            resolve({
              data: String(reader.result).split(",")[1],
              mimeType: reference.type,
            });
          reader.readAsDataURL(reference);
        });
      }
      const res = await fetch("/api/creative-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          message:
            input ||
            "Describe this reference’s broad musical qualities and uncertainty.",
          history: messages.slice(-8),
          genre,
          audio,
          rightsConfirmed: rights,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "The assistant is unavailable.");
      setReply(data.text);
      setMessages((m) => [
        ...m,
        { role: "user", text: input || "Analyze my reference" },
        { role: "assistant", text: data.text },
      ]);
      setInput("");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dictate = () => {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Voice input is not supported here. Type your idea instead.");
      return;
    }
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = navigator.language;
    rec.interimResults = false;
    rec.onresult = (e: any) =>
      setInput((old) => `${old} ${e.results[0][0].transcript}`.trim());
    rec.onend = () => setRecording(false);
    rec.onerror = () => {
      setRecording(false);
      setNotice(
        "Microphone access or transcription failed. You can still type.",
      );
    };
    try {
      rec.start();
      setRecording(true);
    } catch {
      setNotice("Could not start voice input. Try typing.");
    }
  };
  const exportVideo = async () => {
    const track = mine.find((t) => t.id === videoId);
    if (!track) return;
    const url = URL.createObjectURL(track.audio);
    setVideoProgress(0);
    try {
      const result = {
        id: track.id,
        title: track.title,
        audioUrl: url,
        creatorHandle: track.owner,
        lyrics: track.lyrics,
        coverImageUrl: createStudioCoverSvg(
          "#172554",
          "#581c87",
          "#f9a8d4",
          "band",
        ),
      } as SongResult;
      await handleDownloadVideo(
        result,
        !!track.lyrics,
        setVideoProgress,
        () => setVideoProgress(null),
        track.source === "sample"
          ? "Original procedural sketch"
          : track.source === "generated"
            ? "AI-generated studio audio"
            : track.source === "mix"
              ? "Creator-authorized mix"
              : "Creator-uploaded audio",
      );
      setNotice(
        "Visualizer downloaded as WebM. This is not generated animation.",
      );
    } catch (e) {
      setNotice(`Video export failed: ${(e as Error).message}`);
    } finally {
      URL.revokeObjectURL(url);
      setVideoProgress(null);
    }
  };
  return (
    <div className="cw cw-workspace">
      <header className="cw-hero">
        <small>
          {mode === "listen"
            ? "TOLD THEM · THE LISTENING ROOM"
            : mode === "library"
              ? "YOUR STORIES. YOUR SPACE."
              : "TELL THEM · THE CREATIVE ROOM"}
        </small>
        <h1>
          {mode === "listen"
            ? "A little curiosity. A lot of possibility."
            : mode === "library"
              ? "Your library, your way."
              : "An idea is enough to begin."}
        </h1>
        <p>
          {mode === "listen"
            ? "Explore sounds, discover a direction, and meet the making side of music."
            : mode === "library"
              ? "Keep songs, podcasts, lyrics, and sketches together. Everything starts private."
              : "Talk it through, type it out, or ask for a little help. Your voice stays at the center."}
        </p>
      </header>
      {(notice || error) && (
        <div className="cw-notice" role="status">
          {notice || error}
        </div>
      )}
      {mode === "listen" && (
        <>
          <div className="cw-panel">
            <h2>Pick a room. Hear what’s possible.</h2>
            <div className="cw-chips">
              {GENRES.map((g) => (
                <button
                  aria-pressed={g === genre}
                  className={g === genre ? "active" : ""}
                  key={g}
                  onClick={() => setGenre(g)}
                >
                  {g}
                </button>
              ))}
              <button onClick={onPodcast}>Podcast studio ↗</button>
            </div>
          </div>
          <GenreSamples genre={genre} owner={owner} onCreate={onCreate} />
          <PodcastSamples />
        </>
      )}
      {mode === "library" && (
        <section className="cw-panel">
          <h2>Bring your own audio</h2>
          <p>
            Stored only in this browser—not an account or cloud backup. Handles
            are local labels, not authenticated identities. Imports are limited
            to 25 MB each. Only upload work you own or have permission to use.
          </p>
          <div className="cw-fields">
            <label>
              Genre
              <select
                value={uploadGenre}
                onChange={(e) => setUploadGenre(e.target.value)}
              >
                {GENRES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              Content type
              <select
                value={uploadKind}
                onChange={(e) =>
                  setUploadKind(e.target.value as LibraryTrack["kind"])
                }
              >
                <option value="music">Music / vocal stem</option>
                <option value="podcast">Podcast</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>
          </div>
          <label className="cw-check">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />{" "}
            I own this audio or have permission to store and use it.
          </label>
          <input
            aria-label="Import audio"
            type="file"
            accept="audio/*"
            disabled={!rights || busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("audio/")) {
                setNotice("Choose an audio file.");
                return;
              }
              if (file.size > 25 * 1024 * 1024) {
                setNotice("Choose a file under 25 MB.");
                return;
              }
              setBusy(true);
              try {
                await put({
                  ...makeTrack(
                    file.name.replace(/\.[^.]+$/, ""),
                    uploadGenre,
                    file,
                    "upload",
                    owner,
                  ),
                  kind: uploadKind,
                });
                setNotice("Imported privately.");
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </section>
      )}
      {mode !== "creative" && (
        <section className="cw-panel">
          <div className="cw-heading">
            <div>
              <h2>
                {mode === "listen"
                  ? "Platform-public selections · local preview"
                  : "My saved creations"}
              </h2>
              <p>
                {mode === "listen"
                  ? "Only explicitly public items appear here. This list shows this browser’s library; with your own handle, public items also sync to the live community catalog above. Public listening never grants remix permission."
                  : "Rename, organize, export, or delete your work. Public and remix permissions are separate."}
              </p>
            </div>
            <label>
              Filter
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option>All</option>
                {GENRES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
                <option value="podcast">podcast</option>
                <option value="commercial">commercial</option>
              </select>
            </label>
          </div>
          {!visible.length && (
            <div className="cw-empty">
              {mode === "listen"
                ? "Nothing shared yet. Save a sketch or import your own work, then explicitly mark it public in My Library."
                : "Your first idea belongs here. Save a genre sketch, import audio, or save a completed studio creation."}
            </div>
          )}
          <div className="cw-grid">
            {visible.map((t) => {
              const trackMotif =
                t.kind === "podcast"
                  ? "podcast"
                  : t.kind === "commercial"
                    ? "commercial"
                    : "band";
              const trackPictureUrl =
                t.coverImageUrl ||
                createUniqueSongArtworkSvg({
                  title: t.title,
                  genre: t.genre,
                  lyrics: t.lyrics,
                  creatorHandle: t.owner,
                  seed: t.id,
                  motif: trackMotif,
                });
              const trackPictureTheme = describeSongPictureTheme({
                title: t.title,
                genre: t.genre,
                lyrics: t.lyrics,
                creatorHandle: t.owner,
                seed: t.id,
                motif: trackMotif,
              }).trim();
              return (
              <article className="cw-track" key={t.id}>
                <img
                  data-testid="library-track-picture"
                  src={trackPictureUrl}
                  alt={`Picture coinciding with ${t.title}: ${trackPictureTheme}`}
                  className="w-full h-44 rounded-2xl object-cover border border-gray-200 mb-3"
                />
                <small>
                  {t.genre} · {t.kind} · {t.source} · Picture: {trackPictureTheme}
                </small>
                <h3>{t.title}</h3>
                <p>
                  {t.owner} ·{" "}
                  {t.visibility === "private"
                    ? "Private"
                    : "Public (local preview)"}{" "}
                  · {t.remixAllowed ? "Remix permitted" : "Listening only"}
                </p>
                {t.syncState && (
                  <p
                    data-testid="library-sync-status"
                    data-sync-state={t.syncState}
                    className="text-xs text-gray-500"
                  >
                    {t.moderationHold
                      ? "Awaiting review"
                      : t.consentWithdrawnAt
                        ? "Consent withdrawn"
                        : SYNC_LABELS[t.syncState] || t.syncState}
                    {t.syncMessage ? ` · ${t.syncMessage}` : ""}
                  </p>
                )}
                <Player audio={t.audio} />
                {mode === "listen" ? (
                  <button
                    onClick={() =>
                      onCreate(
                        (GENRES.includes(t.genre as SampleGenre)
                          ? t.genre
                          : "Custom Genre") as BandArchetype,
                        `Create an original track with ${t.genre} instrumentation and a new story. Do not copy melodies, lyrics, or voices.`,
                      )
                    }
                  >
                    Explore this genre ↗
                  </button>
                ) : (
                  <>
                    <label>
                      Title
                      <input
                        defaultValue={t.title}
                        onBlur={async (e) => {
                          const title = e.target.value.trim();
                          if (title && title !== t.title)
                            try {
                              await put({ ...t, title });
                            } catch (e) {
                              setNotice((e as Error).message);
                            }
                        }}
                      />
                    </label>
                    <label>
                      Move to genre
                      <select
                        value={t.genre}
                        onChange={async (e) => {
                          try {
                            await put({ ...t, genre: e.target.value });
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      >
                        {GENRES.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                        {!GENRES.includes(t.genre as SampleGenre) && (
                          <option>{t.genre}</option>
                        )}
                      </select>
                    </label>
                    <label className="cw-check">
                      <input
                        type="checkbox"
                        disabled={Boolean(t.consentWithdrawnAt)}
                        checked={t.visibility === "public"}
                        onChange={async (e) => {
                          try {
                            await put({
                              ...t,
                              visibility: e.target.checked
                                ? "public"
                                : "private",
                              remixAllowed: e.target.checked
                                ? t.remixAllowed
                                : false,
                            });
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      />{" "}
                      Public listening (local preview)
                    </label>
                    <label className="cw-check">
                      <input
                        type="checkbox"
                        disabled={t.visibility !== "public" || Boolean(t.consentWithdrawnAt)}
                        checked={t.remixAllowed}
                        onChange={async (e) => {
                          try {
                            await put({ ...t, remixAllowed: e.target.checked });
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      />{" "}
                      Separately allow remixes
                    </label>
                    <details>
                      <summary>Lyrics / notes</summary>
                      <textarea
                        aria-label={`Lyrics for ${t.title}`}
                        defaultValue={t.lyrics}
                        onBlur={async (e) => {
                          try {
                            await put({ ...t, lyrics: e.target.value });
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      />
                    </details>
                    <div className="cw-actions">
                      <button
                        onClick={() => {
                          const url = URL.createObjectURL(t.audio),
                            a = document.createElement("a");
                          a.href = url;
                          a.download = `${t.title}.${t.audio.type.includes("wav") ? "wav" : t.audio.type.includes("mpeg") ? "mp3" : t.audio.type.includes("ogg") ? "ogg" : t.audio.type.includes("mp4") ? "m4a" : "webm"}`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Download audio
                      </button>
                      <button
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob(
                              [
                                JSON.stringify(
                                  { ...t, audio: undefined },
                                  null,
                                  2,
                                ),
                              ],
                              { type: "application/json" },
                            ),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${t.title}-notes.json`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Export lyrics & notes
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            window.confirm(
                              `Delete “${t.title}” from this browser? Download a backup first.`,
                            )
                          )
                            try {
                              await remove(t.id);
                            } catch (e) {
                              setNotice((e as Error).message);
                            }
                        }}
                      >
                        Delete
                      </button>
                      {t.remoteId && !t.consentWithdrawnAt && (
                        <>
                          <button
                            data-testid="withdraw-consent"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Withdraw consent for “${t.title}”? It and every remix of it will disappear from the live catalog. You can undo this during the grace period.`,
                                )
                              )
                                return;
                              const r = await withdraw(t, "soft");
                              setNotice(r.message);
                            }}
                          >
                            Withdraw consent
                          </button>
                          <button
                            data-testid="erase-from-catalog"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Erase “${t.title}” from the live catalog permanently? Audio for it and all of its remixes is deleted immediately and cannot be restored.`,
                                )
                              )
                                return;
                              const r = await withdraw(t, "hard");
                              setNotice(r.message);
                            }}
                          >
                            Erase from catalog
                          </button>
                        </>
                      )}
                      {t.consentWithdrawnAt && t.consentWithdrawnBecause === "owner" && (
                        <button
                          data-testid="undo-withdrawal"
                          onClick={async () => {
                            const r = await undoWithdraw(t);
                            setNotice(r.message);
                          }}
                        >
                          Undo withdrawal
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
              );
            })}
          </div>
        </section>
      )}
      {mode === "library" && <DistributionPanel owner={owner} tracks={mine} />}
      {mode === "creative" && (
        <>
          <div className="cw-chips">
            {[
              "Creative conversation",
              "Lyrics designer",
              "Sound discovery",
              "Music video & anime",
              "Mashup & vocals",
            ].map((t) => (
              <button
                disabled={busy || videoProgress !== null}
                key={t}
                aria-pressed={tool === t}
                className={tool === t ? "active" : ""}
                onClick={() => {
                  setTool(t);
                  setRights(false);
                  setReference(null);
                  setNotice("");
                }}
              >
                {t}
              </button>
            ))}
            <button onClick={onPodcast}>Podcast maker ↗</button>
          </div>
          {tool !== "Mashup & vocals" && (
            <section className="cw-panel">
              <h2>{tool}</h2><p className="cw-note">Text drafts and conversations are saved in this browser per tool. Audio references must be selected again after leaving.</p>
              <button disabled={busy} onClick={() => { if (window.confirm("Clear this tool’s conversation and draft?")) { setMessages([]); setInput(""); setReply(""); } }}>Clear this conversation</button>
              <p>
                {tool === "Lyrics designer"
                  ? "Find a theme, shape verses, refine a chorus. AI drafts stay editable and can go directly into the song studio."
                  : tool === "Sound discovery"
                    ? "Describe a sound or upload a permitted excerpt. Get broad genre, instrumentation, mood, and rhythm suggestions—not artist identification, voice cloning, or a recipe for copying a song."
                    : tool === "Music video & anime"
                      ? "Plan an original visual story, including anime-inspired scenes. Storyboard generation is text only; animation generation is not connected. Export a cover-art audio visualizer below."
                      : "An AI creative partner for getting unstuck. Ask a question, discuss a direction, and refine your idea together."}
              </p>
              <label>
                Creative direction
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as SampleGenre)}
                >
                  {GENRES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              {tool === "Sound discovery" && (
                <>
                  <label>
                    Optional short reference audio
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) =>
                        setReference(e.target.files?.[0] || null)
                      }
                    />
                  </label>
                  <label className="cw-check">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(e) => setRights(e.target.checked)}
                    />{" "}
                    I have permission to analyze this audio.
                  </label>
                  <p className="cw-note">
                    Reference excerpts are sent to the configured AI provider
                    for analysis, not saved in the library. Under 15 MB.
                    Analysis is approximate and may be wrong.
                  </p>
                </>
              )}
              <div className="cw-conversation" aria-live="polite">
                {messages.map((m, i) => (
                  <div className={`cw-message ${m.role}`} key={i}>
                    <small>
                      {m.role === "user" ? "YOU" : "CREATIVE ASSISTANT"}
                    </small>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              <label>
                Your idea
                <textarea
                  aria-label="Your idea"
                  value={input}
                  maxLength={6000}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    tool === "Lyrics designer"
                      ? "Help me write a hopeful chorus about starting again, without clichés…"
                      : tool === "Sound discovery"
                        ? "I like an acoustic, storytelling sound with a raspy texture. What broad genres might I explore?"
                        : "I have a feeling, but not quite a song yet…"
                  }
                />
              </label>
              <div className="cw-actions">
                <button
                  disabled={
                    busy ||
                    (!input.trim() &&
                      !(reference && tool === "Sound discovery"))
                  }
                  onClick={ask}
                >
                  {busy ? "Thinking…" : "Ask the assistant ↗"}
                </button>
                <button onClick={dictate}>
                  {recording ? "Stop microphone" : "Speak your idea"}
                </button>
              </div>
              <p className="cw-note">
                AI requires server configuration. Voice input is optional and
                may use your browser’s transcription service. No celebrity
                imitation or copied lyrics, melodies, or protected characters.
              </p>
              {reply && (
                <div className="cw-actions">
                  <button
                    onClick={() =>
                      onCreate(
                        genre,
                        `Creative brief: ${reply}\nCreate original music; no artist imitation.`,
                      )
                    }
                  >
                    Use as song direction ↗
                  </button>
                  {tool === "Lyrics designer" && (
                    <button onClick={() => onLyrics(reply)}>
                      Edit in lyrics studio ↗
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(reply);
                        setNotice("Copied.");
                      } catch {
                        setNotice(
                          "Copy unavailable. Select the response text to copy it.",
                        );
                      }
                    }}
                  >
                    Copy response
                  </button>
                </div>
              )}
            </section>
          )}
          {tool === "Music video & anime" && (
            <section className="cw-panel">
              <h2>Make a music visualizer</h2>
              <p>
                Combine your saved audio with original studio cover art and a
                moving spectrum. Add lyrics in your library for lyric overlay.
                Untimed lyrics use approximate line timing, not vocal alignment.
                WebM export runs in real time; leave this page open.
              </p>
              <label>
                Saved audio
                <select
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  disabled={videoProgress !== null}
                >
                  <option value="">Select a track</option>
                  {mine.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!videoId || videoProgress !== null}
                onClick={exportVideo}
              >
                {videoProgress === null
                  ? "Export visualizer video"
                  : `Rendering ${Math.round(videoProgress)}%`}
              </button>
            </section>
          )}
          {tool === "Mashup & vocals" && (
            <section className="cw-panel">
              <h2>A new conversation between sounds.</h2>
              <p>
                Overlay two of your tracks—or a public track whose creator
                explicitly permits remixes. For adding vocals, import a vocal
                stem and a backing track in My Library. This mixer does not
                remove vocals, separate stems, or automatically match beats.
              </p>
              <div className="cw-fields">
                {[
                  ["First track / backing", first, setFirst],
                  ["Second track / vocal", second, setSecond],
                ].map(([label, value, setter]) => (
                  <label key={label as string}>
                    {label as string}
                    <select
                      value={value as string}
                      onChange={(e) =>
                        (setter as (x: string) => void)(e.target.value)
                      }
                    >
                      <option value="">Select authorized audio</option>
                      {candidates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {t.owner}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label>
                Mix name
                <input
                  value={mixTitle}
                  onChange={(e) => setMixTitle(e.target.value)}
                />
              </label>
              <label>
                Blend · first {Math.round((1 - balance) * 100)}% / second{" "}
                {Math.round(balance * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={balance}
                  onChange={(e) => setBalance(Number(e.target.value))}
                />
              </label>
              <label className="cw-check">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />{" "}
                I have rights to remix both sources.
              </label>
              <button
                disabled={
                  busy ||
                  !rights ||
                  !first ||
                  !second ||
                  first === second ||
                  !mixTitle.trim()
                }
                onClick={async () => {
                  const a = candidates.find((t) => t.id === first),
                    b = candidates.find((t) => t.id === second);
                  if (!a || !b) {
                    setNotice("One source is no longer authorized.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const audio = await mixAudio(a.audio, b.audio, balance);
                    await put(
                      makeTrack(mixTitle.trim(), genre, audio, "mix", owner),
                    );
                    setNotice(
                      "Mix saved privately in My Library. Exports are capped at 2:48.",
                    );
                  } catch (e) {
                    setNotice(
                      `Could not mix these files: ${(e as Error).message}`,
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Rendering your mix…" : "Render & save private mix"}
              </button>
              <div className="cw-notice">
                <strong>Want no vocals?</strong>
                <p>
                  Generate a new singer-free track in Band Studio. Removing
                  vocals from an existing recording requires a stem-separation
                  service, which is not connected.
                </p>
                <button
                  onClick={() =>
                    onCreate(
                      "Singer-Free Instrumental",
                      "Create an original singer-free backing track with space for my own voice. No sung or spoken vocals.",
                    )
                  }
                >
                  Make a singer-free backing track ↗
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
