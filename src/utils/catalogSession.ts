/**
 * Creator session manager for the live catalog.
 *
 * Deduplicates concurrent session requests, caches the outcome per handle, and exposes a
 * tiny observable status so the UI can say honestly whether it is syncing or working locally.
 * Failures never throw: they degrade to local-only mode.
 */
import { useSyncExternalStore } from 'react';
import type { CreatorProfile } from '../types/community';
import {
  CatalogFailure,
  CatalogResult,
  ensureSession,
  isOk,
} from './catalogClient';

export type CatalogStatus = 'checking' | 'online' | 'needs-handle' | 'offline';

export interface CatalogState {
  status: CatalogStatus;
  message: string;
  handle: string | null;
  profile: CreatorProfile | null;
}

const TRANSIENT_TTL_MS = 30_000;
const UNAVAILABLE_TTL_MS = 5 * 60_000;

let state: CatalogState = {
  status: 'checking',
  message: 'Connecting to the live catalog…',
  handle: null,
  profile: null,
};
const listeners = new Set<() => void>();
let cache: { handle: string; result: CatalogResult<CreatorProfile>; at: number } | null = null;
let inflight: { handle: string; promise: Promise<CatalogResult<CreatorProfile>> } | null = null;

function setState(next: CatalogState) {
  state = next;
  listeners.forEach((l) => l());
}

export const getCatalogState = (): CatalogState => state;

export function subscribeCatalogState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useCatalogState = (): CatalogState =>
  useSyncExternalStore(subscribeCatalogState, getCatalogState, getCatalogState);

function describeFailure(handle: string, failure: CatalogFailure): CatalogState {
  const base = { handle, profile: null };
  if (failure.reason === 'conflict') {
    return { ...base, status: 'needs-handle', message: `${handle} is already claimed in the live catalog. Choose a different handle to sync your work.` };
  }
  if (failure.code === 'reserved_handle') {
    return { ...base, status: 'needs-handle', message: 'Choose your own handle (Change Handle) to publish to the live catalog. Everything still works locally.' };
  }
  if (failure.reason === 'invalid') {
    return { ...base, status: 'needs-handle', message: 'Handles use 3-30 letters, numbers or underscores. Everything still works locally.' };
  }
  return { ...base, status: 'offline', message: 'Live catalog unavailable — working locally. Your work is saved in this browser.' };
}

/** Failures that will not fix themselves until the handle changes. */
const isPermanent = (f: CatalogFailure) =>
  f.reason === 'conflict' || f.reason === 'invalid' || f.code === 'reserved_handle';

function isFresh(entry: NonNullable<typeof cache>, handle: string): boolean {
  if (entry.handle !== handle) return false;
  if (isOk(entry.result)) return true;
  if (isPermanent(entry.result)) return true;
  const ttl = entry.result.reason === 'unavailable' ? UNAVAILABLE_TTL_MS : TRANSIENT_TTL_MS;
  return Date.now() - entry.at < ttl;
}

/** Establishes (or confirms) the cookie session for `handle`. Safe to call from anywhere, often. */
export function getCatalogSession(handle: string): Promise<CatalogResult<CreatorProfile>> {
  if (cache && isFresh(cache, handle)) return Promise.resolve(cache.result);
  if (inflight && inflight.handle === handle) return inflight.promise;

  if (state.handle !== handle || state.status === 'offline') {
    setState({ status: 'checking', message: 'Connecting to the live catalog…', handle, profile: null });
  }
  const promise = ensureSession(handle).then((result) => {
    cache = { handle, result, at: Date.now() };
    inflight = null;
    if (isOk(result)) {
      setState({
        status: 'online',
        message: `Live catalog connected as ${result.data.handle}.`,
        handle,
        profile: result.data,
      });
    } else {
      setState(describeFailure(handle, result));
    }
    return result;
  });
  inflight = { handle, promise };
  return promise;
}

/** Forget the cached session (e.g. after a 401), so the next call re-establishes it. */
export function invalidateCatalogSession(): void {
  cache = null;
}

/** Test/diagnostic hook. */
export function resetCatalogSessionForTests(): void {
  cache = null;
  inflight = null;
  setState({ status: 'checking', message: 'Connecting to the live catalog…', handle: null, profile: null });
}
