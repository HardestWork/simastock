import { useEffect } from 'react';
import { CloudUpload, Check, Loader2 } from 'lucide-react';
import { useOfflineSyncStore } from '@/lib/offline-sync';

/**
 * Small badge in the Topbar showing pending offline sales count
 * and sync status. Hidden when nothing is pending.
 */
export function OfflineSyncIndicator() {
  const { pendingCount, isSyncing, syncAll, refreshCount } = useOfflineSyncStore();

  // Refresh count on mount
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <button
      onClick={() => syncAll()}
      disabled={isSyncing}
      className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-70"
      title={isSyncing ? 'Synchronisation en cours...' : `${pendingCount} vente(s) en attente de synchronisation`}
    >
      {isSyncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : pendingCount === 0 ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <CloudUpload className="h-3.5 w-3.5" />
      )}
      <span>
        {isSyncing
          ? 'Sync...'
          : pendingCount === 0
            ? 'Synced'
            : `${pendingCount} offline`}
      </span>
    </button>
  );
}
