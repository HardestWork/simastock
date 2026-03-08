import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Displays a banner when a new PWA version is available.
 * registerType: 'prompt' means the SW waits for us to call updateServiceWorker().
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Poll every 60s for updates when app is open
      if (r) {
        setInterval(() => r.update(), 60_000);
      }
    },
  });

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (needRefresh) setVisible(true);
  }, [needRefresh]);

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm">
      <div className="flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white shadow-lg">
        <RefreshCw className="h-5 w-5 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-semibold leading-tight">Mise à jour disponible</p>
          <p className="text-blue-100 text-xs mt-0.5">Rechargez pour obtenir la dernière version.</p>
        </div>
        <button
          onClick={handleUpdate}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Recharger
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg p-1 text-blue-200 hover:text-white hover:bg-blue-500 transition-colors"
          aria-label="Ignorer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
