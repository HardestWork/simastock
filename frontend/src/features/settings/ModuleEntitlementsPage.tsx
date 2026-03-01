import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Save, ShieldCheck, Store as StoreIcon } from 'lucide-react';

import { billingApi, enterpriseApi, storeApi } from '@/api/endpoints';
import type {
  BillingModule,
  EnterprisePlanStatus,
  ModuleEntitlementState,
} from '@/api/types';
import { useAuthStore } from '@/auth/auth-store';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100';

const STATUS_OPTIONS: Array<{ value: EnterprisePlanStatus; label: string }> = [
  { value: 'TRIAL', label: 'Essai' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'PAST_DUE', label: 'Impaye' },
  { value: 'CANCELED', label: 'Resilie' },
  { value: 'EXPIRED', label: 'Expire' },
];

const STATE_LABELS: Record<ModuleEntitlementState, string> = {
  INHERIT: 'Heriter',
  ENABLED: 'Activer',
  DISABLED: 'Desactiver',
};

type OverrideDraft = Record<string, { state: ModuleEntitlementState; reason: string }>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ModuleEntitlementsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSuperuser = Boolean(user?.is_superuser);

  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planStatus, setPlanStatus] = useState<EnterprisePlanStatus>('ACTIVE');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>({});

  const enterprisesQ = useQuery({
    queryKey: queryKeys.enterprises.all,
    queryFn: () => enterpriseApi.list({ page_size: '200', ordering: 'name' }),
  });
  const storesQ = useQuery({
    queryKey: queryKeys.stores.all,
    queryFn: () => storeApi.list({ page_size: '500', ordering: 'name' }),
  });
  const plansQ = useQuery({
    queryKey: queryKeys.billing.plans({ is_active: 'true' }),
    queryFn: () => billingApi.plans({ is_active: 'true', page_size: '200', ordering: 'name' }),
  });
  const modulesQ = useQuery({
    queryKey: queryKeys.billing.modules({ is_active: 'true' }),
    queryFn: () => billingApi.modules({ is_active: 'true', page_size: '200', ordering: 'display_order' }),
  });

  const enterprises = enterprisesQ.data?.results ?? [];
  const stores = storesQ.data?.results ?? [];
  const plans = plansQ.data?.results ?? [];
  const modules = modulesQ.data?.results ?? [];

  useEffect(() => {
    if (selectedEnterpriseId) return;
    if (enterprises.length === 0) return;
    setSelectedEnterpriseId(enterprises[0].id);
  }, [selectedEnterpriseId, enterprises]);

  const filteredStores = useMemo(() => {
    if (!selectedEnterpriseId) return stores;
    return stores.filter((s) => s.enterprise === selectedEnterpriseId);
  }, [stores, selectedEnterpriseId]);

  useEffect(() => {
    if (filteredStores.length === 0) {
      setSelectedStoreId('');
      return;
    }
    if (filteredStores.some((s) => s.id === selectedStoreId)) return;
    setSelectedStoreId(filteredStores[0].id);
  }, [filteredStores, selectedStoreId]);

  const currentAssignmentQ = useQuery({
    queryKey: queryKeys.billing.currentAssignment(selectedEnterpriseId || undefined),
    queryFn: () =>
      billingApi.currentAssignment(
        isSuperuser && selectedEnterpriseId ? { enterprise: selectedEnterpriseId } : undefined,
      ),
    enabled: !isSuperuser || Boolean(selectedEnterpriseId),
  });

  const assignmentHistoryQ = useQuery({
    queryKey: queryKeys.billing.assignments({ enterprise: selectedEnterpriseId }),
    queryFn: () =>
      billingApi.assignments({
        page_size: '10',
        ordering: '-starts_on',
        ...(selectedEnterpriseId ? { enterprise: selectedEnterpriseId } : {}),
      }),
    enabled: !isSuperuser || Boolean(selectedEnterpriseId),
  });

  const storeMatrixQ = useQuery({
    queryKey: queryKeys.billing.storeMatrix(selectedStoreId || undefined),
    queryFn: () => billingApi.storeMatrix({ store: selectedStoreId }),
    enabled: Boolean(selectedStoreId),
  });

  useEffect(() => {
    if (!storeMatrixQ.data) return;
    const next: OverrideDraft = {};
    for (const row of storeMatrixQ.data.entitlements) {
      next[row.module_code] = {
        state: row.state,
        reason: row.reason ?? '',
      };
    }
    setOverrideDraft(next);
  }, [storeMatrixQ.data]);

  const assignPlanMutation = useMutation({
    mutationFn: () =>
      billingApi.createAssignment({
        ...(isSuperuser && selectedEnterpriseId ? { enterprise: selectedEnterpriseId } : {}),
        plan: selectedPlanId,
        status: planStatus,
        starts_on: startsOn,
        ends_on: endsOn || null,
        auto_renew: autoRenew,
      }),
    onSuccess: () => {
      toast.success('Plan affecte avec succes.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.currentAssignment(selectedEnterpriseId || undefined) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.assignments({ enterprise: selectedEnterpriseId }) });
      if (selectedStoreId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.billing.storeMatrix(selectedStoreId) });
      }
    },
    onError: (err) => {
      toast.error(extractApiError(err));
    },
  });

  const saveOverridesMutation = useMutation({
    mutationFn: () => {
      const payload = {
        store: selectedStoreId,
        overrides: modules.map((m) => {
          const row = overrideDraft[m.code] ?? { state: 'INHERIT' as ModuleEntitlementState, reason: '' };
          return {
            module_code: m.code,
            state: row.state,
            reason: row.reason,
          };
        }),
      };
      return billingApi.bulkUpsertStoreEntitlements(payload);
    },
    onSuccess: () => {
      toast.success('Overrides modules enregistres.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.storeMatrix(selectedStoreId || undefined) });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'module-matrix', selectedStoreId] });
    },
    onError: (err) => {
      toast.error(extractApiError(err));
    },
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const assignment = currentAssignmentQ.data?.assignment ?? null;
  const effectiveModules = storeMatrixQ.data?.effective_modules ?? {};
  const dependencies = storeMatrixQ.data?.dependencies ?? {};

  const selectedEnterprise = enterprises.find((e) => e.id === selectedEnterpriseId) ?? null;
  const selectedStore = stores.find((s) => s.id === selectedStoreId) ?? null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary" />
            Modules payants
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Affectez un plan a l&apos;entreprise puis ajustez les modules par boutique.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Affectation plan entreprise</h2>
          </div>

          {isSuperuser && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Entreprise</label>
              <select
                value={selectedEnterpriseId}
                onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                className={inputClass}
              >
                <option value="">Selectionner...</option>
                {enterprises.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} ({ent.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentAssignmentQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Chargement de l&apos;affectation courante...
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
              <div className="text-gray-500 dark:text-gray-400">Plan actif</div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {assignment ? `${assignment.plan_name} (${assignment.plan_code})` : 'Aucun plan actif'}
              </div>
              {assignment && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {assignment.starts_on} {' -> '} {assignment.ends_on ?? 'illimite'} | statut: {assignment.status}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Plan</label>
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                disabled={plansQ.isLoading || plansQ.isError}
                className={inputClass}
              >
                <option value="">
                  {plansQ.isLoading
                    ? 'Chargement des plans...'
                    : plansQ.isError
                      ? 'Erreur chargement plans'
                      : 'Selectionner un plan...'}
                </option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.code})
                  </option>
                ))}
              </select>
              {plansQ.isError && (
                <div className="mt-1 text-xs text-red-600">{extractApiError(plansQ.error)}</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Statut</label>
              <select
                value={planStatus}
                onChange={(e) => setPlanStatus(e.target.value as EnterprisePlanStatus)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Debut</label>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fin</label>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
            Renouvellement automatique
          </label>

          {selectedPlan && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Modules du plan {selectedPlan.name}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedPlan.module_codes.map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => assignPlanMutation.mutate()}
              disabled={!selectedPlanId || !startsOn || assignPlanMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {assignPlanMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Affecter le plan
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Historique affectations</h3>
          {assignmentHistoryQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : assignmentHistoryQ.isError ? (
            <div className="text-sm text-red-600">{extractApiError(assignmentHistoryQ.error)}</div>
          ) : (assignmentHistoryQ.data?.results?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune affectation.</div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {assignmentHistoryQ.data?.results.map((row) => (
                <div key={row.id} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {row.plan_name} ({row.plan_code})
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.starts_on} {' -> '} {row.ends_on ?? 'illimite'} | {row.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <StoreIcon size={16} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Overrides modules par boutique</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isSuperuser && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Entreprise</label>
              <select
                value={selectedEnterpriseId}
                onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                className={inputClass}
              >
                <option value="">Selectionner...</option>
                {enterprises.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Boutique</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className={inputClass}
            >
              <option value="">Selectionner...</option>
              {filteredStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {storeMatrixQ.isLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Chargement matrice modules...
          </div>
        ) : storeMatrixQ.isError ? (
          <div className="text-sm text-red-600">{extractApiError(storeMatrixQ.error)}</div>
        ) : !selectedStore ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Selectionnez une boutique.</div>
        ) : (
          <>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Source: <span className="font-medium">{storeMatrixQ.data?.source ?? 'n/a'}</span> | Plan: <span className="font-medium">{storeMatrixQ.data?.plan_code ?? 'aucun'}</span>
              {selectedEnterprise && <> | Entreprise: <span className="font-medium">{selectedEnterprise.name}</span></>}
              {selectedStore && <> | Boutique: <span className="font-medium">{selectedStore.name}</span></>}
            </div>

            <div className="overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr className="text-left text-gray-600 dark:text-gray-300">
                    <th className="px-3 py-2">Module</th>
                    <th className="px-3 py-2">Etat effectif</th>
                    <th className="px-3 py-2">Override</th>
                    <th className="px-3 py-2">Raison</th>
                    <th className="px-3 py-2">Dependances</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((module: BillingModule) => {
                    const draft = overrideDraft[module.code] ?? { state: 'INHERIT' as ModuleEntitlementState, reason: '' };
                    const deps = dependencies[module.code] ?? [];
                    const effective = Boolean(effectiveModules[module.code]);
                    return (
                      <tr key={module.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{module.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{module.code}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${effective ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {effective ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draft.state}
                            onChange={(e) =>
                              setOverrideDraft((prev) => ({
                                ...prev,
                                [module.code]: {
                                  ...draft,
                                  state: e.target.value as ModuleEntitlementState,
                                },
                              }))
                            }
                            className={inputClass}
                          >
                            {(Object.keys(STATE_LABELS) as ModuleEntitlementState[]).map((state) => (
                              <option key={state} value={state}>
                                {STATE_LABELS[state]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={draft.reason}
                            onChange={(e) =>
                              setOverrideDraft((prev) => ({
                                ...prev,
                                [module.code]: {
                                  ...draft,
                                  reason: e.target.value,
                                },
                              }))
                            }
                            placeholder="Optionnel"
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {deps.length > 0 ? deps.join(', ') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => saveOverridesMutation.mutate()}
                disabled={!selectedStoreId || modules.length === 0 || saveOverridesMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {saveOverridesMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Enregistrer les overrides
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
