/**
 * Pre-caches POS products into IndexedDB when the user is authenticated
 * and online. Runs once after login/page load.
 */
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/auth/auth-store';
import { useStoreStore } from '@/store-context/store-store';
import { productApi } from '@/api/endpoints';
import { cacheProducts } from '@/lib/offline-db';

export function useProductPrecache() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentStore = useStoreStore((s) => s.currentStore);
  const lastCachedStoreId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !currentStore) return;
    if (!navigator.onLine) return;
    // Skip if already cached for this store
    if (lastCachedStoreId.current === currentStore.id) return;

    lastCachedStoreId.current = currentStore.id;
    const storeId = currentStore.id;

    // Fetch all products in pages and cache them for the current store
    (async () => {
      try {
        let page = 1;
        let allProducts: Awaited<ReturnType<typeof productApi.available>>['results'] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const res = await productApi.available({
            store: storeId,
            page_size: '100',
            page: String(page),
            ordering: 'name',
          });
          allProducts = allProducts.concat(res.results);
          if (!res.next) break;
          page++;
        }
        await cacheProducts(allProducts, storeId);
      } catch {
        // Silently fail — cache is best-effort
      }
    })();
  }, [isAuthenticated, currentStore]);
}
