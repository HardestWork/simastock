/**
 * Zustand store that manages offline sync state and background flushing.
 *
 * When the browser comes back online, it drains the IndexedDB queue
 * by POSTing each pending sale to `/api/v1/sales/offline-sync/`.
 */
import { create } from 'zustand';
import apiClient from '@/api/client';
import {
  getPendingSales,
  markSaleSynced,
  markSaleError,
  pendingSaleCount,
  deleteSyncedSales,
} from './offline-db';

interface OfflineSyncState {
  /** Number of sales waiting to be synced */
  pendingCount: number;
  /** Currently syncing */
  isSyncing: boolean;
  /** Last sync error (human-readable) */
  lastError: string | null;
  /** Refresh the pending count from IndexedDB */
  refreshCount: () => Promise<void>;
  /** Flush all pending sales to the server */
  syncAll: () => Promise<void>;
}

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  pendingCount: 0,
  isSyncing: false,
  lastError: null,

  refreshCount: async () => {
    const count = await pendingSaleCount();
    set({ pendingCount: count });
  },

  syncAll: async () => {
    if (get().isSyncing) return;
    if (!navigator.onLine) return;

    set({ isSyncing: true, lastError: null });

    try {
      const pending = await getPendingSales();
      let successCount = 0;

      for (const sale of pending) {
        try {
          await apiClient.post('sales/offline-sync/', {
            offline_id: sale.offline_id,
            store_id: sale.store_id,
            customer_id: sale.customer_id || null,
            discount_percent: sale.discount_percent,
            notes: sale.notes,
            items: sale.items.map((item) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              discount_amount: item.discount_amount,
              unit_price_override: item.unit_price_override || null,
            })),
            created_at: sale.created_at,
          });
          await markSaleSynced(sale.offline_id);
          successCount++;
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Erreur de synchronisation';
          await markSaleError(sale.offline_id, message);
        }
      }

      // Purge successfully synced entries
      if (successCount > 0) {
        await deleteSyncedSales();
      }
    } catch {
      set({ lastError: 'Erreur lors de la synchronisation.' });
    } finally {
      const count = await pendingSaleCount();
      set({ isSyncing: false, pendingCount: count });
    }
  },
}));

// ── Auto-sync on online event ───────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineSyncStore.getState().syncAll();
  });

  // Also sync when the module is first loaded if we're online
  // (handles the case where sales were queued and the page was refreshed).
  setTimeout(() => {
    if (navigator.onLine) {
      useOfflineSyncStore.getState().refreshCount().then(() => {
        if (useOfflineSyncStore.getState().pendingCount > 0) {
          useOfflineSyncStore.getState().syncAll();
        }
      });
    } else {
      useOfflineSyncStore.getState().refreshCount();
    }
  }, 2000);
}
