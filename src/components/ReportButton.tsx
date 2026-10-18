import React, { useState } from 'react';
import { Flag } from 'lucide-react';
import { isOk, reportCreation } from '../utils/catalogClient';
import type { ReportReason } from '../types/community';

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'rights', label: 'I own this / rights violation' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'pii', label: 'Shares personal information' },
  { value: 'unsafe', label: 'Unsafe or illegal content' },
  { value: 'other', label: 'Something else' },
];

interface ReportButtonProps {
  /** Server-side creation id (only catalog-backed items can be reported). */
  creationId: string;
  title: string;
}

type Phase = 'closed' | 'open' | 'sending' | 'sent' | 'error';

/**
 * Lightweight, anonymous-friendly report flow. No account is required; the server de-duplicates
 * per reporter and stores only a salted hash of the reporter key.
 */
export const ReportButton: React.FC<ReportButtonProps> = ({ creationId, title }) => {
  const [phase, setPhase] = useState<Phase>('closed');
  const [reason, setReason] = useState<ReportReason>('rights');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');

  const submit = async () => {
    setPhase('sending');
    const res = await reportCreation(creationId, { reason, details: details.trim() || undefined });
    if (isOk(res)) {
      setMessage('Thanks. Your report was received and will be reviewed.');
      setPhase('sent');
    } else {
      setMessage(res.reason === 'rate_limited' ? 'Too many reports from this device. Try again later.' : res.message);
      setPhase('error');
    }
  };

  if (phase === 'sent') {
    return (
      <p role="status" data-testid="report-sent" className="text-[11px] font-semibold text-emerald-700">
        {message}
      </p>
    );
  }

  return (
    <div className="text-xs">
      <button
        type="button"
        aria-label={`Report ${title}`}
        aria-expanded={phase !== 'closed'}
        onClick={() => setPhase(phase === 'closed' ? 'open' : 'closed')}
        className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600 font-semibold"
      >
        <Flag size={12} />
        <span>Report</span>
      </button>
      {phase !== 'closed' && (
        <form
          aria-label={`Report ${title}`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3"
        >
          <label className="block space-y-1">
            <span className="font-semibold text-gray-700">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-gray-700">Details (optional)</span>
            <textarea
              value={details}
              maxLength={500}
              rows={2}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
            />
          </label>
          {phase === 'error' && (
            <p role="alert" className="text-[11px] font-semibold text-red-600">
              {message}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={phase === 'sending'}
              className="rounded-lg bg-gray-900 px-3 py-1.5 font-bold text-white disabled:opacity-60"
            >
              {phase === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={() => setPhase('closed')} className="text-gray-500 hover:text-gray-800">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
