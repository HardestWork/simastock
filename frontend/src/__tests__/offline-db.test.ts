import { describe, it, expect, beforeEach } from 'vitest';
import {
  addPendingSale,
  getPendingSales,
  getAllOfflineSales,
  markSaleSynced,
  markSaleError,
  deleteSyncedSales,
  pendingSaleCount,
  cacheProducts,
  getCachedProducts,
  clearProductCache,
  type OfflineSale,
} from '@/lib/offline-db';
import type { PosProduct } from '@/api/types';

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
        quantity: 2,
        unit_price: '5000',
        discount_amount: '0',
      },
    ],
    total: '10000',
    created_at: new Date().toISOString(),
    synced: 0,
    ...overrides,
  };
}

function makeProduct(id: string, name: string): PosProduct {
  return {
    id,
    name,
    sku: `SKU-${id}`,
    barcode: '',
    selling_price: '5000',
    product_type: 'GOODS' as PosProduct['product_type'],
    track_stock: true,
    is_active: true,
    available_qty: 10,
    has_stock: true,
  };
}

// ── Clear IDB between tests ────────────────────────────────────────────

beforeEach(async () => {
  // Wipe all pending sales
  const all = await getAllOfflineSales();
  for (const s of all) {
    await markSaleSynced(s.offline_id);
  }
  await deleteSyncedSales();
  await clearProductCache();
});

// ── Pending Sales ───────────────────────────────────────────────────────

describe('Pending sales CRUD', () => {
  it('adds and retrieves a pending sale', async () => {
    const sale = makeSale();
    await addPendingSale(sale);

    const pending = await getPendingSales();
    expect(pending).toHaveLength(1);
    expect(pending[0].offline_id).toBe(sale.offline_id);
    expect(pending[0].synced).toBe(0);
  });

  it('returns only unsynced sales from getPendingSales', async () => {
    const s1 = makeSale();
    const s2 = makeSale({ synced: 1 });
    await addPendingSale(s1);
    await addPendingSale(s2);

    const pending = await getPendingSales();
    expect(pending).toHaveLength(1);
    expect(pending[0].offline_id).toBe(s1.offline_id);
  });

  it('getAllOfflineSales returns all sales including synced', async () => {
    const s1 = makeSale();
    const s2 = makeSale();
    await addPendingSale(s1);
    await addPendingSale(s2);
    await markSaleSynced(s2.offline_id);

    const all = await getAllOfflineSales();
    expect(all).toHaveLength(2);
  });

  it('pendingSaleCount counts only unsynced', async () => {
    await addPendingSale(makeSale());
    await addPendingSale(makeSale());
    const s3 = makeSale();
    await addPendingSale(s3);
    await markSaleSynced(s3.offline_id);

    const count = await pendingSaleCount();
    expect(count).toBe(2);
  });
});

describe('markSaleSynced', () => {
  it('marks a sale as synced and clears error', async () => {
    const sale = makeSale();
    await addPendingSale(sale);
    await markSaleError(sale.offline_id, 'Network error');

    await markSaleSynced(sale.offline_id);

    const pending = await getPendingSales();
    expect(pending).toHaveLength(0);

    const all = await getAllOfflineSales();
    expect(all[0].synced).toBe(1);
    expect(all[0].sync_error).toBeUndefined();
  });
});

describe('markSaleError', () => {
  it('records an error message on the sale', async () => {
    const sale = makeSale();
    await addPendingSale(sale);

    await markSaleError(sale.offline_id, 'Server 500');

    const pending = await getPendingSales();
    expect(pending).toHaveLength(1);
    expect(pending[0].sync_error).toBe('Server 500');
  });
});

describe('deleteSyncedSales', () => {
  it('removes only synced sales from the store', async () => {
    const s1 = makeSale();
    const s2 = makeSale();
    const s3 = makeSale();
    await addPendingSale(s1);
    await addPendingSale(s2);
    await addPendingSale(s3);

    await markSaleSynced(s1.offline_id);
    await markSaleSynced(s3.offline_id);

    await deleteSyncedSales();

    const all = await getAllOfflineSales();
    expect(all).toHaveLength(1);
    expect(all[0].offline_id).toBe(s2.offline_id);
  });

  it('is a no-op when nothing is synced', async () => {
    await addPendingSale(makeSale());
    await deleteSyncedSales();

    const count = await pendingSaleCount();
    expect(count).toBe(1);
  });
});

// ── Product Cache ───────────────────────────────────────────────────────

describe('Product cache', () => {
  const storeId = 'store-1';

  it('caches and retrieves products', async () => {
    const products = [
      makeProduct('p1', 'Chargeur'),
      makeProduct('p2', 'Cable HDMI'),
    ];
    await cacheProducts(products, storeId);

    const cached = await getCachedProducts(storeId);
    expect(cached).toHaveLength(2);
    expect(cached.map((p) => p.name).sort()).toEqual(['Cable HDMI', 'Chargeur']);
  });

  it('strips cached_at from returned products', async () => {
    await cacheProducts([makeProduct('p1', 'Test')], storeId);
    const cached = await getCachedProducts(storeId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((cached[0] as any).cached_at).toBeUndefined();
  });

  it('overwrites existing product on re-cache', async () => {
    await cacheProducts([makeProduct('p1', 'Old Name')], storeId);
    await cacheProducts([{ ...makeProduct('p1', 'New Name'), selling_price: '9999' }], storeId);

    const cached = await getCachedProducts(storeId);
    expect(cached).toHaveLength(1);
    expect(cached[0].name).toBe('New Name');
    expect(cached[0].selling_price).toBe('9999');
  });

  it('clearProductCache empties the store', async () => {
    await cacheProducts([makeProduct('p1', 'Test')], storeId);
    await clearProductCache(storeId);

    const cached = await getCachedProducts(storeId);
    expect(cached).toHaveLength(0);
  });
});
