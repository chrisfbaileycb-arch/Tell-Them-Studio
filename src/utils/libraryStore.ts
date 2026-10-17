export interface LibraryTrack {
  id: string;
  title: string;
  genre: string;
  kind: "music" | "podcast" | "commercial";
  audio: Blob;
  createdAt: string;
  visibility: "private" | "public";
  remixAllowed: boolean;
  source: "sample" | "upload" | "generated" | "mix";
  lyrics: string;
  owner: string;
  coverImageUrl?: string;
}
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("tell-them-library", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("tracks", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Check your privacy settings.",
        ),
      );
  });
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", mode),
      request = action(tx.objectStore("tracks"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Could not save to browser storage. It may be full or disabled.",
        ),
      );
    };
  });
}
export const loadLibrary = () =>
  transaction("readonly", (s) => s.getAll()) as Promise<LibraryTrack[]>;
export const saveTrack = (track: LibraryTrack) =>
  transaction("readwrite", (s) => s.put(track));
export const deleteTrack = (id: string) =>
  transaction("readwrite", (s) => s.delete(id));
