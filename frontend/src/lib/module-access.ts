import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { authApi } from '@/api/endpoints';
import type { FeatureFlags, ModuleCode, ModuleMatrix } from '@/api/types';
import { useAuthStore } from '@/auth/auth-store';
import { useStoreStore } from '@/store-context/store-store';

export const DEFAULT_MODULE_MATRIX: ModuleMatrix = {
  CORE: true,
  SELL: true,
  CASH: true,
  CUSTOMER: true,
  STOCK: true,
  PURCHASE: true,
  EXPENSE: true,
  COMMERCIAL: true,
  SELLER_PERF: true,
  ANALYTICS_MANAGER: true,
  ANALYTICS_CASHIER: true,
  ANALYTICS_STOCK: true,
  ANALYTICS_DG: true,
  CLIENT_INTEL: true,
  ALERTS: true,
};

export function deriveModuleMatrixFromFlags(flags?: FeatureFlags): ModuleMatrix {
  const f = flags ?? {};
  return {
    ...DEFAULT_MODULE_MATRIX,
    SELL: Boolean(f.sales_pos ?? true),
    CASH: Boolean(f.cashier_operations ?? true),
    CUSTOMER: Boolean((f.sales_pos ?? true) && (f.credit_management ?? true)),
    STOCK: Boolean(f.stock_management ?? true),
    PURCHASE: Boolean(f.purchases_management ?? true),
    EXPENSE: Boolean(f.expenses_management ?? true),
    COMMERCIAL: Boolean((f.commercial_pipeline ?? true) && (f.sales_pos ?? true)),
    SELLER_PERF: Boolean((f.enabled ?? true) && (f.sales_pos ?? true)),
    ANALYTICS_MANAGER: Boolean((f.enabled ?? true) && (f.reports_center ?? true)),
    ANALYTICS_CASHIER: Boolean((f.enabled ?? true) && (f.cashier_operations ?? true)),
    ANALYTICS_STOCK: Boolean((f.enabled ?? true) && (f.stock_management ?? true)),
    ANALYTICS_DG: Boolean((f.enabled ?? true) && (f.dashboard_strategic ?? true)),
    CLIENT_INTEL: Boolean((f.enabled ?? true) && (f.credit_scoring ?? true) && (f.credit_management ?? true)),
    ALERTS: Boolean(f.alerts_center ?? true),
  };
}

export function useModuleMatrix() {
  const user = useAuthStore((s) => s.user);
  const currentStore = useStoreStore((s) => s.currentStore);

  const query = useQuery({
    queryKey: ['auth', 'module-matrix', currentStore?.id],
    queryFn: () => authApi.moduleMatrix(currentStore?.id ? { store: currentStore.id } : undefined),
    enabled: Boolean(user && currentStore?.id),
    staleTime: 60_000,
  });

  const moduleMatrix = useMemo<ModuleMatrix>(() => {
    const apiModules = query.data?.modules;
    if (apiModules && Object.keys(apiModules).length > 0) {
      return { ...DEFAULT_MODULE_MATRIX, ...apiModules };
    }
    return deriveModuleMatrixFromFlags(currentStore?.effective_feature_flags);
  }, [currentStore?.effective_feature_flags, query.data?.modules]);

  const isModuleEnabled = (moduleCode?: ModuleCode): boolean => {
    if (!moduleCode) return true;
    return Boolean(moduleMatrix[moduleCode]);
  };

  return {
    moduleMatrix,
    isModuleEnabled,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
