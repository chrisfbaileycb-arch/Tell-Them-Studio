import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// Text and settings only. Audio/files remain in IndexedDB or in memory.
export function useDraft<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `tell-them-draft-v1:${key}`;
  const read = () => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return fallback;
      const saved = JSON.parse(raw);
      if (saved === null || Array.isArray(saved) !== Array.isArray(fallback) || typeof saved !== typeof fallback) return fallback;
      return saved as T;
    } catch { return fallback; }
  };
  const [entry, setEntry] = useState(() => ({ key: storageKey, value: read() }));
  // Switching creative tools restores that tool's independent draft before paint.
  if (entry.key !== storageKey) setEntry({ key: storageKey, value: read() });
  useEffect(() => {
    if (entry.key !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(entry.value));
    } catch {
      window.dispatchEvent(new Event('studio-draft-error'));
    }
  }, [storageKey, entry]);
  const setValue: Dispatch<SetStateAction<T>> = (next) => setEntry(current => ({
    key: storageKey,
    value: typeof next === 'function' ? (next as (old: T) => T)(current.key === storageKey ? current.value : read()) : next,
  }));
  return [entry.key === storageKey ? entry.value : read(), setValue];
}
