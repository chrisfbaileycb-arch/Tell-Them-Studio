/**
 * Single source of truth for the active creator handle outside React state, so the
 * library provider (mounted above the studio) and the studio hook stay in agreement.
 */
export const HANDLE_STORAGE_KEY = 'tell-them-handle';
export const DEFAULT_CREATOR_HANDLE = '@studio_voyager';
const HANDLE_EVENT = 'tell-them-handle-changed';

export function readCreatorHandle(): string {
  try {
    return localStorage.getItem(HANDLE_STORAGE_KEY) || DEFAULT_CREATOR_HANDLE;
  } catch {
    return DEFAULT_CREATOR_HANDLE;
  }
}

export function announceCreatorHandle(handle: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(HANDLE_EVENT, { detail: handle }));
}

export function subscribeCreatorHandle(listener: (handle: string) => void): () => void {
  const onEvent = (e: Event) => listener((e as CustomEvent<string>).detail || readCreatorHandle());
  window.addEventListener(HANDLE_EVENT, onEvent);
  return () => window.removeEventListener(HANDLE_EVENT, onEvent);
}
