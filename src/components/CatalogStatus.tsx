import React from 'react';
import { useCatalogState } from '../utils/catalogSession';

/**
 * Honest, low-key indicator of whether this session is syncing with the live catalog or
 * working purely locally. Never blocks anything: every workflow also works while offline.
 */
export function CatalogStatus({ className = '' }: { className?: string }) {
  const state = useCatalogState();
  const label =
    state.status === 'online'
      ? 'Live catalog: on — generated tracks are backed up privately; public ones are shared'
      : state.status === 'checking'
        ? 'Live catalog: connecting…'
        : state.status === 'needs-handle'
          ? 'Live catalog: choose a handle to sync'
          : 'Live catalog: offline (working locally)';
  const tone =
    state.status === 'online'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : state.status === 'checking'
        ? 'bg-gray-50 text-gray-700 border-gray-200'
        : 'bg-amber-50 text-amber-900 border-amber-200';
  return (
    <span
      data-testid="catalog-status"
      data-catalog-status={state.status}
      title={state.message}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone} ${className}`}
    >
      {label}
    </span>
  );
}

/** Truthful note for the Listen tabs: only claims live publishing while the catalog is connected. */
export function ListenPreviewNote({ className = '' }: { className?: string }) {
  const state = useCatalogState();
  return (
    <p className={className}>
      {state.status === 'online'
        ? 'Listening to the live community catalog plus this browser’s shared tracks. Only creations that pass moderation are published.'
        : 'Local listening preview · demo activity and this browser’s shared tracks. Nothing is published online.'}
    </p>
  );
}
