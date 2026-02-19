/** Hooks for capability-based permission checks in the frontend. */
import { useStoreStore } from '@/store-context/store-store';
import type { Capability } from '@/api/types';

/**
 * Returns the current user's effective capabilities for the selected store.
 * Falls back to an empty array if no store is selected or no capabilities
 * are available (e.g. feature flag disabled — the backend returns
 * role-based defaults in that case via `my_capabilities`).
 */
export function useCapabilities(): Capability[] {
  const currentStore = useStoreStore((s) => s.currentStore);
  return currentStore?.my_capabilities ?? [];
}

/**
 * Check if the current user has a specific capability in the selected store.
 */
export function useHasCapability(cap: Capability): boolean {
  const caps = useCapabilities();
  return caps.includes(cap);
}
