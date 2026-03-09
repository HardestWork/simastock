import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addPendingSale, getPendingSales, type OfflineSale } from '@/lib/offline-db';
import { useOfflineSyncStore } from '@/lib/offline-sync';

// ── Mock apiClient ──────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

import apiClient from '@/api/client';
const mockPost = vi.mocked(apiClient.post);

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSale(overrides: Partial<OfflineSale> = {}): OfflineSale {
  return {
    offline_id: crypto.randomUUID(),
    store_id: 'store-1',
    discount_percent: '0',
    notes: '',
    items: [
      {
        product_id: 'prod-1',
        product_name: 'Test Product',
        quantity: 1,
        unit_price: '5000',
        discount_amount: '0',
      },
    ],
    total: '5000',
    created_at: new Date().toISOString(),
    synced: 0,
    ...overrides,
  };
}

async function clearAllSales() {
  // Mark all as synced then delete
  const { markSaleSynced, deleteSyncedSales } = await import('@/lib/offline-db');
  const all = await (await import('@/lib/offline-db')).getAllOfflineSales();
  for (const s of all) {
    await markSaleSynced(s.offline_id);
  }
  await deleteSyncedSales();
}

// ── Setup ───────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  await clearAllSales();
  // Reset store state
  useOfflineSyncStore.setState({ pendingCount: 0, isSyncing: false, lastError: null });
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('useOfflineSyncStore', () => {
  describe('refreshCount', () => {
    it('reads pending count from IndexedDB', async () => {
      await addPendingSale(makeSale());
      await addPendingSale(makeSale());

      await useOfflineSyncStore.getState().refreshCount();

      expect(useOfflineSyncStore.getState().pendingCount).toBe(2);
    });

    it('returns 0 when no pending sales', async () => {
      await useOfflineSyncStore.getState().refreshCount();
      expect(useOfflineSyncStore.getState().pendingCount).toBe(0);
    });
  });

  describe('syncAll', () => {
    it('posts each pending sale to the API', async () => {
      mockPost.mockResolvedValue({ data: { id: 'sale-1' } });

      const s1 = makeSale();
      const s2 = makeSale();
      await addPendingSale(s1);
      await addPendingSale(s2);

      // Pretend we're online
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

      await useOfflineSyncStore.getState().syncAll();

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost.mock.calls[0][0]).toBe('sales/offline-sync/');
      // IDB order is not guaranteed — just check both IDs were posted
      const postedIds = mockPost.mock.calls.map((c) => (c[1] as { offline_id: string }).offline_id);
      expect(postedIds).toContain(s1.offline_id);
      expect(postedIds).toContain(s2.offline_id);
    });

    it('marks sales as synced after successful post', async () => {
      mockPost.mockResolvedValue({ data: { id: 'sale-1' } });

      await addPendingSale(makeSale());
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

      await useOfflineSyncStore.getState().syncAll();

      const pending = await getPendingSales();
      expect(pending).toHaveLength(0);
      expect(useOfflineSyncStore.getState().pendingCount).toBe(0);
    });

    it('records error on failed post without blocking others', async () => {
      const s1 = makeSale();
      const s2 = makeSale();
      await addPendingSale(s1);
      await addPendingSale(s2);

      // First call fails, second succeeds
      mockPost
        .mockRejectedValueOnce({ response: { data: { detail: 'Server error' } } })
        .mockResolvedValueOnce({ data: { id: 'sale-2' } });

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      await useOfflineSyncStore.getState().syncAll();

      // One sale should still be pending with error, the other synced
      const pending = await getPendingSales();
      expect(pending).toHaveLength(1);
      expect(pending[0].sync_error).toBe('Server error');
    });

    it('does nothing when offline', async () => {
      await addPendingSale(makeSale());
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

      await useOfflineSyncStore.getState().syncAll();

      expect(mockPost).not.toHaveBeenCalled();
      // Restore
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    });

    it('does not run concurrently', async () => {
      mockPost.mockImplementation(() => new Promise((r) => setTimeout(() => r({ data: {} }), 50)));

      await addPendingSale(makeSale());
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

      // Fire two syncs simultaneously
      const p1 = useOfflineSyncStore.getState().syncAll();
      const p2 = useOfflineSyncStore.getState().syncAll();
      await Promise.all([p1, p2]);

      // Only 1 API call since second sync is skipped (isSyncing guard)
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('sets isSyncing during execution', async () => {
      let wasSyncing = false;
      mockPost.mockImplementation(() => {
        wasSyncing = useOfflineSyncStore.getState().isSyncing;
        return Promise.resolve({ data: {} });
      });

      await addPendingSale(makeSale());
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

      await useOfflineSyncStore.getState().syncAll();

      expect(wasSyncing).toBe(true);
      expect(useOfflineSyncStore.getState().isSyncing).toBe(false);
    });
  });
});
