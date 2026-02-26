import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '@/api/client';
import type { PaginatedResponse } from '@/api/types';
import { useAuthStore } from '@/auth/auth-store';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';

type CommercialTab = 'pipeline' | 'prospects' | 'tasks' | 'incentives';

interface CommercialOpportunity {
  id: string;
  name: string;
  stage: string;
  probability_pct: number;
  estimated_amount: string;
  expected_close_date: string | null;
  owner_name: string | null;
  prospect_name: string | null;
}

interface CommercialProspect {
  id: string;
  company_name: string;
  contact_name: string;
  status: string;
  owner_name: string | null;
  estimated_potential: string;
  score: number;
  next_follow_up_at: string | null;
}

interface CommercialTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_at: string;
  assigned_to_name: string | null;
}

interface CommercialIncentiveRun {
  id: string;
  period: string;
  status: string;
  computed_at: string | null;
}

interface CommercialIncentiveResult {
  id: string;
  seller_name: string | null;
  signed_revenue: string;
  quoted_revenue: string;
  win_rate: string;
  final_bonus: string;
}

const STAGE_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'PROSPECT', label: 'Prospect' },
  { key: 'CONTACTED', label: 'Contacte' },
  { key: 'RDV', label: 'RDV' },
  { key: 'QUOTE_SENT', label: 'Devis envoye' },
  { key: 'NEGOTIATION', label: 'Negociation' },
  { key: 'WON', label: 'Gagne' },
  { key: 'LOST', label: 'Perdu' },
];

const NEXT_STAGE_MAP: Record<string, string | undefined> = {
  PROSPECT: 'CONTACTED',
  CONTACTED: 'RDV',
  RDV: 'QUOTE_SENT',
  QUOTE_SENT: 'NEGOTIATION',
  NEGOTIATION: 'WON',
};

function resolveTab(pathname: string): CommercialTab {
  if (pathname.endsWith('/prospects')) return 'prospects';
  if (pathname.endsWith('/tasks')) return 'tasks';
  if (pathname.endsWith('/incentives')) return 'incentives';
  return 'pipeline';
}

function tabPath(tab: CommercialTab): string {
  if (tab === 'prospects') return '/commercial/prospects';
  if (tab === 'tasks') return '/commercial/tasks';
  if (tab === 'incentives') return '/commercial/incentives';
  return '/commercial';
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(dateValue?: string | null): string {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-FR');
}

export default function CommercialPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tab = resolveTab(location.pathname);
  const [period, setPeriod] = useState(currentPeriod());
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const storeId = currentStore?.id ?? '';
  const canComputeIncentives = Boolean(user?.is_superuser || user?.role === 'ADMIN' || user?.role === 'MANAGER');

  const opportunitiesQuery = useQuery({
    queryKey: ['commercial', 'opportunities', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialOpportunity>>('commercial/opportunities/', {
        params: { store: storeId, page_size: '120', ordering: 'stage,pipeline_order,-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && tab === 'pipeline',
  });

  const prospectsQuery = useQuery({
    queryKey: ['commercial', 'prospects', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialProspect>>('commercial/prospects/', {
        params: { store: storeId, page_size: '80', ordering: '-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && tab === 'prospects',
  });

  const tasksQuery = useQuery({
    queryKey: ['commercial', 'tasks', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialTask>>('commercial/tasks/', {
        params: { store: storeId, page_size: '80', ordering: 'due_at' },
      });
      return response.data;
    },
    enabled: !!storeId && tab === 'tasks',
  });

  const incentiveRunsQuery = useQuery({
    queryKey: ['commercial', 'incentive-runs', storeId, period],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialIncentiveRun>>('commercial/incentive-runs/', {
        params: { store: storeId, period, ordering: '-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && tab === 'incentives',
  });

  useEffect(() => {
    if (!incentiveRunsQuery.data?.results.length) {
      setSelectedRunId('');
      return;
    }
    if (!selectedRunId) {
      setSelectedRunId(incentiveRunsQuery.data.results[0].id);
      return;
    }
    const stillExists = incentiveRunsQuery.data.results.some((row) => row.id === selectedRunId);
    if (!stillExists) setSelectedRunId(incentiveRunsQuery.data.results[0].id);
  }, [incentiveRunsQuery.data, selectedRunId]);

  const incentiveResultsQuery = useQuery({
    queryKey: ['commercial', 'incentive-results', storeId, selectedRunId],
    queryFn: async () => {
      const response = await apiClient.get<CommercialIncentiveResult[]>(
        `commercial/incentive-runs/${selectedRunId}/results/`,
        { params: { store: storeId } },
      );
      return response.data;
    },
    enabled: !!storeId && tab === 'incentives' && !!selectedRunId,
  });

  const moveStageMutation = useMutation({
    mutationFn: async (payload: { id: string; toStage: string }) => {
      await apiClient.post(`commercial/opportunities/${payload.id}/move-stage/`, {
        store: storeId,
        to_stage: payload.toStage,
        reason: 'UI progression pipeline',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['commercial', 'opportunities', storeId] });
      toast.success('Etape mise a jour.');
    },
    onError: () => toast.error("Impossible de changer l'etape."),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiClient.post(`commercial/tasks/${taskId}/complete/`, { store: storeId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['commercial', 'tasks', storeId] });
      toast.success('Tache terminee.');
    },
    onError: () => toast.error('Impossible de terminer la tache.'),
  });

  const computeIncentivesMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('commercial/incentive-runs/compute/', { store: storeId, period });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['commercial', 'incentive-runs', storeId, period] });
      toast.success('Calcul des primes termine.');
    },
    onError: () => toast.error('Calcul des primes impossible.'),
  });

  const opportunitiesByStage = useMemo(() => {
    const grouped: Record<string, CommercialOpportunity[]> = {};
    for (const col of STAGE_COLUMNS) grouped[col.key] = [];
    for (const row of opportunitiesQuery.data?.results ?? []) {
      if (!grouped[row.stage]) grouped[row.stage] = [];
      grouped[row.stage].push(row);
    }
    return grouped;
  }, [opportunitiesQuery.data]);

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Commercial CRM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boutique: {currentStore.name}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2 mb-4 flex flex-wrap gap-2">
        {(['pipeline', 'prospects', 'tasks', 'incentives'] as CommercialTab[]).map((entry) => (
          <button
            key={entry}
            onClick={() => navigate(tabPath(entry))}
            className={`px-3 py-2 rounded-lg text-sm ${
              tab === entry ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            {entry === 'pipeline' && 'Pipeline'}
            {entry === 'prospects' && 'Prospects'}
            {entry === 'tasks' && 'Relances'}
            {entry === 'incentives' && 'Primes'}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <div className="space-y-4">
          {opportunitiesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {STAGE_COLUMNS.map((column) => (
                <div key={column.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{column.label}</h2>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {(opportunitiesByStage[column.key] ?? []).length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(opportunitiesByStage[column.key] ?? []).map((row) => (
                      <div key={row.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/30">
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{row.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{row.prospect_name || '-'}</div>
                        <div className="text-xs text-gray-500">{formatCurrency(row.estimated_amount)} - {row.probability_pct}%</div>
                        <div className="text-xs text-gray-400">Cloture: {formatDate(row.expected_close_date)}</div>
                        {NEXT_STAGE_MAP[row.stage] && (
                          <button
                            onClick={() => moveStageMutation.mutate({ id: row.id, toStage: NEXT_STAGE_MAP[row.stage]! })}
                            disabled={moveStageMutation.isPending}
                            className="mt-2 w-full text-xs px-2 py-1 rounded bg-primary text-white disabled:opacity-50"
                          >
                            Etape suivante
                          </button>
                        )}
                      </div>
                    ))}
                    {(opportunitiesByStage[column.key] ?? []).length === 0 && (
                      <div className="text-xs text-gray-400 py-3 text-center">Aucune opportunite</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'prospects' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {prospectsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Entreprise</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Commercial</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Potentiel</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Prochaine relance</th>
                </tr>
              </thead>
              <tbody>
                {(prospectsQuery.data?.results ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3">{row.company_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.contact_name || '-'}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.owner_name || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.estimated_potential)}</td>
                    <td className="px-4 py-3 text-right">{row.score}</td>
                    <td className="px-4 py-3">{formatDate(row.next_follow_up_at)}</td>
                  </tr>
                ))}
                {(prospectsQuery.data?.results ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Aucun prospect.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {tasksQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Titre</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Assigne a</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Priorite</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Echeance</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {(tasksQuery.data?.results ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3">{row.title}</td>
                    <td className="px-4 py-3">{row.assigned_to_name || '-'}</td>
                    <td className="px-4 py-3">{row.priority}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{formatDate(row.due_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {row.status !== 'DONE' ? (
                        <button
                          onClick={() => completeTaskMutation.mutate(row.id)}
                          disabled={completeTaskMutation.isPending}
                          className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                        >
                          Terminer
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(tasksQuery.data?.results ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Aucune tache.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'incentives' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Periode</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            {canComputeIncentives && (
              <button
                onClick={() => computeIncentivesMutation.mutate()}
                disabled={computeIncentivesMutation.isPending}
                className="px-3 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
              >
                Calculer primes
              </button>
            )}
            <div className="ml-auto">
              <label className="block text-xs text-gray-500 mb-1">Run</label>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              >
                {(incentiveRunsQuery.data?.results ?? []).map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.period} - {run.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {incentiveResultsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Commercial</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">CA signe</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">CA devis</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Tx transfo</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Prime finale</th>
                  </tr>
                </thead>
                <tbody>
                  {(incentiveResultsQuery.data ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="px-4 py-3">{row.seller_name || '-'}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.signed_revenue)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.quoted_revenue)}</td>
                      <td className="px-4 py-3 text-right">{row.win_rate}%</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.final_bonus)}</td>
                    </tr>
                  ))}
                  {(incentiveResultsQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Aucun resultat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
