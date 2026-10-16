import { CommunityFeedItem, SongResult } from '../../types';
import { createStudioCoverSvg } from '../../constants';
import { createStudioPreviewWavUrl } from './audioUtils';

export const COMMUNITY_FEED_STORAGE_KEY = 'tell-them-community-feed';
const IDB_NAME = 'tell-them-community-audio';
const IDB_STORE = 'audio_blobs';

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCommunityAudioBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ id, blob });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore IDB errors in restricted environments
  }
}

export async function loadCommunityAudioBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openAudioDb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => {
        db.close();
        resolve(req.result?.blob || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function getSeedCommunityFeed(): CommunityFeedItem[] {
  const rockWav = createStudioPreviewWavUrl('rock');
  const discoWav = createStudioPreviewWavUrl('disco');
  return [
    {
      id: 'seed-band-1',
      title: 'Steel City Gold & Black',
      creatorHandle: '@riverfront_rockers',
      genre: 'Rock Band',
      audioUrl: rockWav,
      lyrics: `[0:00] (Male Lead) Under the Friday river lights, hear the bridges hum\n[0:18] (Female Lead) Three rivers rising up, the weekend has begun!\n[0:36] (Full Band Chorus) Wave the gold and black tonight, standing shoulder to shoulder`,
      type: 'music',
      createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      durationLabel: '3:42',
      vocalArrangement: 'Multi-Singer Trade-Off (Male & Female)',
      coverImageUrl: createStudioCoverSvg('#1e1b4b', '#7f1d1d', '#f59e0b', 'band'),
    },
    {
      id: 'seed-hair-metal-1',
      title: 'Sunset Strip Arena Nights',
      creatorHandle: '@glam_shred_88',
      genre: 'Hair Metal Band',
      audioUrl: rockWav,
      lyrics: `[0:00] (High Lead Vocal) Spotlights cutting through the velvet haze\n[0:20] (Twin-Guitar Harmony) Pyrotechnic thunder sets the stage ablaze!\n[0:42] (Gang Chorus) Turn the amplifiers up to ten tonight!`,
      type: 'music',
      createdAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      durationLabel: '3:35',
      vocalArrangement: 'Dual Male Lead & Harmony',
      coverImageUrl: createStudioCoverSvg('#3b0764', '#be185d', '#f59e0b', 'band'),
    },
    {
      id: 'seed-band-2',
      title: 'Starlight Roller Boogie',
      creatorHandle: '@velvet_groove_fm',
      genre: 'Disco Band',
      audioUrl: discoWav,
      lyrics: `[0:00] (3-Part Harmony) Lace up the skates, let the mirrorball spin\n[0:24] (Lead Vocal) Brass section kicking in, let the weekend begin`,
      type: 'music',
      createdAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
      durationLabel: '3:38',
      vocalArrangement: '3-Part Band Harmonies',
      coverImageUrl: createStudioCoverSvg('#3b0764', '#9d174d', '#38bdf8', 'band'),
    },
    {
      id: 'seed-pod-1',
      title: 'Backstage Band & Radio Weekly: Crafting the 3:50 Hook',
      creatorHandle: '@studio_voyager',
      genre: 'Podcast',
      audioUrl: discoWav,
      lyrics: `[0:00] Alex: Welcome back to Backstage Band & Radio Weekly! Today we're breaking down how multi-singer rock and hair metal bands craft unforgettable choruses inside the 3:50 radio cutoff.\n\n[0:24] Sam: It's all about the vocal handoff—when Lead 1 passes the pre-chorus right into a full 3-part band harmony, listeners feel that live stadium lift immediately.`,
      type: 'podcast',
      createdAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
      narratorInfo: 'Narrators: Alex (Puck) & Sam (Kore)',
      durationLabel: '7:00',
      coverImageUrl: createStudioCoverSvg('#0f172a', '#1e3a8a', '#38bdf8', 'podcast'),
    },
    {
      id: 'seed-pod-2',
      title: 'Studio Soundcheck: Songwriting with AI or Your Own Lyrics',
      creatorHandle: '@melody_maker_88',
      genre: 'Podcast',
      audioUrl: rockWav,
      lyrics: `[0:00] Jordan: Whether you bring your own notebook of verses or let the studio draft a starting chorus, keeping your creative perspective at the center makes every track shine.\n\n[0:28] Riley: Plus, leaving headroom for live vocal overdubs lets singers test arrangements before heading to the stage.`,
      type: 'podcast',
      createdAt: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      narratorInfo: 'Narrators: Jordan (Fenrir) & Riley (Zephyr)',
      durationLabel: '6:00',
      coverImageUrl: createStudioCoverSvg('#1e1b4b', '#312e81', '#a855f7', 'podcast'),
    },
  ];
}

export function loadCommunityFeedSync(): CommunityFeedItem[] {
  const seeds = getSeedCommunityFeed();
  try {
    const raw = localStorage.getItem(COMMUNITY_FEED_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(COMMUNITY_FEED_STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(COMMUNITY_FEED_STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    // Filter out any commercials and refresh expired blob: URLs on seeded items
    const rockWav = createStudioPreviewWavUrl('rock');
    const discoWav = createStudioPreviewWavUrl('disco');
    return parsed
      .filter((item: any) => item && (item.type === 'music' || item.type === 'podcast'))
      .map((item: CommunityFeedItem) => {
        if (!item.audioUrl || (item.id.startsWith('seed-') && item.audioUrl.startsWith('blob:'))) {
          return {
            ...item,
            audioUrl: item.id.includes('2') || item.id === 'seed-pod-1' ? discoWav : rockWav,
          };
        }
        return item;
      });
  } catch {
    return seeds;
  }
}

export function saveCommunityFeedSync(items: CommunityFeedItem[]): void {
  const filtered = items.filter((item) => item.type === 'music' || item.type === 'podcast');
  try {
    localStorage.setItem(COMMUNITY_FEED_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // If a large data: audioUrl exceeded localStorage quota, store compact audioUrl reference
    try {
      const compact = filtered.map((item) =>
        item.audioUrl && item.audioUrl.startsWith('data:') && item.audioUrl.length > 250000
          ? { ...item, audioUrl: `idb://${item.id}` }
          : item
      );
      localStorage.setItem(COMMUNITY_FEED_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore storage quota failure in private browsing
    }
  }
}

export async function hydrateCommunityFeedAudio(
  items: CommunityFeedItem[]
): Promise<CommunityFeedItem[]> {
  const hydrated = await Promise.all(
    items.map(async (item) => {
      if (item.audioUrl?.startsWith('idb://') || item.audioUrl?.startsWith('blob:')) {
        const blob = await loadCommunityAudioBlob(item.id);
        if (blob) {
          return { ...item, audioUrl: URL.createObjectURL(blob) };
        }
      }
      return item;
    })
  );
  return hydrated;
}

export async function createCommunityFeedItemFromResult(
  result: SongResult,
  podcastNarratorInfo?: string
): Promise<CommunityFeedItem> {
  const type: 'music' | 'podcast' = result.itemType === 'podcast' ? 'podcast' : 'music';
  const genre =
    type === 'podcast'
      ? 'Podcast'
      : result.bandType === 'Custom Genre' && result.customGenreName
      ? result.customGenreName
      : result.bandType;

  let persistedAudioUrl = result.audioUrl || createStudioPreviewWavUrl('rock');
  if (result.audioUrl && result.audioUrl.startsWith('blob:')) {
    try {
      const res = await fetch(result.audioUrl);
      if (res.ok) {
        const blob = await res.blob();
        await saveCommunityAudioBlob(result.id, blob);
        if (blob.size <= 1200000) {
          persistedAudioUrl = await blobToDataUrl(blob);
        }
      }
    } catch {
      // Keep existing audioUrl if blob fetch fails
    }
  }

  const durationLabel =
    type === 'podcast'
      ? `${result.podcastSchedule?.targetMinutes || 7}:00`
      : result.duration.split(' ')[0] || '2:48';

  const narratorInfo =
    type === 'podcast'
      ? podcastNarratorInfo ||
        (result.fullPrompt?.includes('Hosts:')
          ? `Narrators: ${result.fullPrompt.split('Hosts:')[1].trim()}`
          : 'Narrators: Studio Co-Hosts')
      : undefined;

  return {
    id: result.id,
    title: result.title || (type === 'podcast' ? 'Untitled Podcast Episode' : 'Untitled Studio Track'),
    creatorHandle: result.creatorHandle,
    genre,
    audioUrl: persistedAudioUrl,
    lyrics: result.lyrics || '',
    type,
    createdAt:
      result.timestamp instanceof Date
        ? result.timestamp.toISOString()
        : new Date().toISOString(),
    narratorInfo,
    durationLabel,
    coverImageUrl:
      result.coverImageUrl ||
      createStudioCoverSvg(
        type === 'podcast' ? '#0f172a' : '#1e1b4b',
        type === 'podcast' ? '#1e3a8a' : '#7f1d1d',
        type === 'podcast' ? '#38bdf8' : '#f59e0b',
        type === 'podcast' ? 'podcast' : 'band'
      ),
    vocalArrangement: result.vocalArrangement,
  };
}
