/** Zustand store for current store context. */
import { create } from 'zustand';
import type { MyStore } from '@/api/types';

interface StoreState {
  currentStore: MyStore | null;
  setCurrentStore: (store: MyStore) => void;
  initializeStore: (stores: MyStore[]) => void;
}

export const useStoreStore = create<StoreState>((set) => ({
  currentStore: null,

  setCurrentStore: (store) => {
    set({ currentStore: store });
    localStorage.setItem('current_store_id', store.id);
  },

  initializeStore: (stores) => {
    if (stores.length === 0) {
      set({ currentStore: null });
      localStorage.removeItem('current_store_id');
      return;
    }

    // Check for a persisted store preference
    const savedStoreId = localStorage.getItem('current_store_id');
    const savedStore = savedStoreId
      ? stores.find((s) => s.id === savedStoreId)
      : null;

    // Fall back to default store, then first store
    const defaultStore = stores.find((s) => s.is_default);
    const selectedStore = savedStore ?? defaultStore ?? stores[0];
    set({ currentStore: selectedStore });
    localStorage.setItem('current_store_id', selectedStore.id);
  },
}));
