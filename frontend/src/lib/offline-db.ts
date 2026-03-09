/**
 * IndexedDB layer for offline POS sales and product cache.
 *
 * Uses the `idb` library for a typed, promise-based API.
 *
 * NOTE: The `synced` field uses 0/1 instead of boolean because
 * IDB spec only allows numbers/strings/dates/arrays as index keys.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PosProduct } from '@/api/types';

// ── Schema ──────────────────────────────────────────────────────────────────

export interface OfflineSaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  unit_price_override?: string | null;
}

export interface OfflineSale {
  offline_id: string; // crypto.randomUUID()
  store_id: string;
  customer_id?: string | null;
  customer_name?: string;
  discount_percent: string;
  notes: string;
  items: OfflineSaleItem[];
  total: string;
  created_at: string; // ISO string
  /** 0 = pending, 1 = synced (number for valid IDB index key) */
  synced: number;
  sync_error?: string;
}

interface OfflineDB extends DBSchema {
  'pending-sales': {
    key: string; // offline_id
    value: OfflineSale;
    indexes: { 'by-synced': number };
  };
  'product-cache': {
    key: string; // product.id
    value: PosProduct & { cached_at: string; store_id: string };
    indexes: { 'by-store': string };
  };
}

// ── DB Instance ─────────────────────────────────────────────────────────────

const DB_NAME = 'simastock-offline';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

/** @internal — exposed for testing only */
export function _resetDB(): void {
  dbPromise = null;
}

function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains('pending-sales')) {
          const store = db.createObjectStore('pending-sales', { keyPath: 'offline_id' });
          store.createIndex('by-synced', 'synced');
        }
        if (!db.objectStoreNames.contains('product-cache')) {
          const pcStore = db.createObjectStore('product-cache', { keyPath: 'id' });
          pcStore.createIndex('by-store', 'store_id');
        } else if (oldVersion < 2) {
          // v2: add store_id index to existing product-cache store
          const pcStore = transaction.objectStore('product-cache');
          if (!pcStore.indexNames.contains('by-store')) {
            pcStore.createIndex('by-store', 'store_id');
          }
        }
      },
    });
  }
  return dbPromise;
}

// ── Pending Sales ───────────────────────────────────────────────────────────

export async function addPendingSale(sale: OfflineSale): Promise<void> {
  const db = await getDB();
  await db.put('pending-sales', sale);
}

export async function getPendingSales(): Promise<OfflineSale[]> {
  const db = await getDB();
  return db.getAllFromIndex('pending-sales', 'by-synced', IDBKeyRange.only(0));
}

export async function getAllOfflineSales(): Promise<OfflineSale[]> {
  const db = await getDB();
  return db.getAll('pending-sales');
}

export async function markSaleSynced(offlineId: string): Promise<void> {
  const db = await getDB();
  const sale = await db.get('pending-sales', offlineId);
  if (sale) {
    sale.synced = 1;
    sale.sync_error = undefined;
    await db.put('pending-sales', sale);
  }
}

export async function markSaleError(offlineId: string, error: string): Promise<void> {
  const db = await getDB();
  const sale = await db.get('pending-sales', offlineId);
  if (sale) {
    sale.sync_error = error;
    await db.put('pending-sales', sale);
  }
}

export async function deleteSyncedSales(): Promise<void> {
  const db = await getDB();
  const synced = await db.getAllFromIndex('pending-sales', 'by-synced', IDBKeyRange.only(1));
  const tx = db.transaction('pending-sales', 'readwrite');
  for (const sale of synced) {
    tx.store.delete(sale.offline_id);
  }
  await tx.done;
}

export async function pendingSaleCount(): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('pending-sales', 'by-synced', IDBKeyRange.only(0));
}

// ── Product Cache ───────────────────────────────────────────────────────────

export async function cacheProducts(products: PosProduct[], storeId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('product-cache', 'readwrite');
  const now = new Date().toISOString();
  // Clear previous cache for this store before re-caching
  const existing = await tx.store.index('by-store').getAllKeys(storeId);
  for (const key of existing) {
    tx.store.delete(key);
  }
  for (const p of products) {
    tx.store.put({ ...p, cached_at: now, store_id: storeId });
  }
  await tx.done;
}

export async function getCachedProducts(storeId?: string): Promise<PosProduct[]> {
  const db = await getDB();
  let all;
  if (storeId) {
    all = await db.getAllFromIndex('product-cache', 'by-store', storeId);
  } else {
    all = await db.getAll('product-cache');
  }
  // Strip cached_at and store_id before returning
  return all.map((entry) => {
    const { cached_at, store_id, ...rest } = entry;
    void cached_at;
    void store_id;
    return rest as PosProduct;
  });
}

export async function clearProductCache(storeId?: string): Promise<void> {
  const db = await getDB();
  if (storeId) {
    const tx = db.transaction('product-cache', 'readwrite');
    const keys = await tx.store.index('by-store').getAllKeys(storeId);
    for (const key of keys) {
      tx.store.delete(key);
    }
    await tx.done;
  } else {
    await db.clear('product-cache');
  }
}
