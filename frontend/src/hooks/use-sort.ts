/** Hook to manage table sort state and produce DRF ordering param. */
import { useState, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc';

interface UseSortReturn {
  sortField: string | null;
  sortDirection: SortDirection;
  /** DRF-compatible ordering string, e.g. '-created_at' or 'name'. */
  ordering: string | undefined;
  /** Toggle sort on a field: same field → flip direction, new field → asc. */
  toggleSort: (field: string) => void;
}

export function useSort(defaultField?: string, defaultDir: SortDirection = 'asc'): UseSortReturn {
  const [sortField, setSortField] = useState<string | null>(defaultField ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDir);

  const toggleSort = useCallback((field: string) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return field;
    });
  }, []);

  const ordering = sortField
    ? sortDirection === 'desc'
      ? `-${sortField}`
      : sortField
    : undefined;

  return { sortField, sortDirection, ordering, toggleSort };
}
