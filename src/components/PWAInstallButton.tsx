import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed standalone PWA, hide the install prompt
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop install prompt flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        data-testid="pwa-install-button"
        className={
          variant === 'dark'
            ? 'px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm'
            : 'px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 shadow-xs'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          data-testid="pwa-ios-install-button"
          className={
            variant === 'dark'
              ? 'px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap'
              : 'px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5'
          }
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-ios-guide-title"
            data-testid="pwa-ios-guide-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowIOSGuide(false);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-gray-900 space-y-3">
              <h3 id="pwa-ios-guide-title" className="text-base font-bold text-gray-900">
                Install Tell Them Studio on iPhone / iPad
              </h3>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>
                  Tap the <strong>Share</strong> button in your Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch Tell Them Studio like a native app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-2 w-full rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-offline-indicator"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Local library &amp; cached studio tools active.</span>
    </div>
  );
};
