import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '@/api/client';
import type { PaginatedResponse } from '@/api/types';
import { useAuthStore } from '@/auth/auth-store';
import { useCapabilities } from '@/lib/capabilities';
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

interface ProspectFormState {
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  estimated_potential: string;
  notes: string;
}

interface OpportunityFormState {
  name: string;
  prospect: string;
  estimated_amount: string;
  probability_pct: string;
  expected_close_date: string;
}

interface TaskFormState {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  due_at_local: string;
  prospect: string;
  opportunity: string;
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

function extractApiError(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) return String(data.non_field_errors[0]);
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const firstValue = data[firstKey];
  if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;
  return fallback;
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40"
        onClick={props.onClose}
      />
      <div className="relative z-10 w-full max-w-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{props.title}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            Fermer
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

export default function CommercialPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const capabilities = useCapabilities();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tab = resolveTab(location.pathname);
  const [period, setPeriod] = useState(currentPeriod());
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [isProspectModalOpen, setProspectModalOpen] = useState(false);
  const [isOpportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState<ProspectFormState>({
    company_name: '',
    contact_name: '',
    phone: '',
    email: '',
    estimated_potential: '',
    notes: '',
  });
  const [opportunityForm, setOpportunityForm] = useState<OpportunityFormState>({
    name: '',
    prospect: '',
    estimated_amount: '',
    probability_pct: '20',
    expected_close_date: '',
  });
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    title: '',
    description: '',
    priority: 'MEDIUM',
    due_at_local: '',
    prospect: '',
    opportunity: '',
  });

  const storeId = currentStore?.id ?? '';
  const isPrivilegedRole = Boolean(user?.is_superuser);
  const canManageLeads = isPrivilegedRole || capabilities.includes('CAN_MANAGE_LEADS');
  const canManageOpportunities = isPrivilegedRole || capabilities.includes('CAN_MANAGE_OPPORTUNITIES');
  const canLogActivity = isPrivilegedRole || capabilities.includes('CAN_LOG_ACTIVITY');
  const canComputeIncentives = isPrivilegedRole || capabilities.includes('CAN_APPROVE_COMMERCIAL_BONUS');
  const availableTabs = useMemo(
    () =>
      ([
        canManageOpportunities ? 'pipeline' : null,
        canManageLeads ? 'prospects' : null,
        canLogActivity ? 'tasks' : null,
        canComputeIncentives ? 'incentives' : null,
      ].filter(Boolean) as CommercialTab[]),
    [canComputeIncentives, canLogActivity, canManageLeads, canManageOpportunities],
  );

  const opportunitiesQuery = useQuery({
    queryKey: ['commercial', 'opportunities', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialOpportunity>>('commercial/opportunities/', {
        params: { store: storeId, page_size: '120', ordering: 'stage,pipeline_order,-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && canManageOpportunities && tab === 'pipeline',
  });

  const prospectsQuery = useQuery({
    queryKey: ['commercial', 'prospects', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialProspect>>('commercial/prospects/', {
        params: { store: storeId, page_size: '80', ordering: '-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && canManageLeads && tab === 'prospects',
  });

  const tasksQuery = useQuery({
    queryKey: ['commercial', 'tasks', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialTask>>('commercial/tasks/', {
        params: { store: storeId, page_size: '80', ordering: 'due_at' },
      });
      return response.data;
    },
    enabled: !!storeId && canLogActivity && tab === 'tasks',
  });

  const prospectsLookupQuery = useQuery({
    queryKey: ['commercial', 'prospects-lookup', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialProspect>>('commercial/prospects/', {
        params: { store: storeId, page_size: '200', ordering: '-updated_at' },
      });
      return response.data.results;
    },
    enabled: !!storeId,
  });

  const opportunitiesLookupQuery = useQuery({
    queryKey: ['commercial', 'opportunities-lookup', storeId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialOpportunity>>('commercial/opportunities/', {
        params: { store: storeId, page_size: '200', ordering: '-updated_at' },
      });
      return response.data.results;
    },
    enabled: !!storeId,
  });

  const incentiveRunsQuery = useQuery({
    queryKey: ['commercial', 'incentive-runs', storeId, period],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<CommercialIncentiveRun>>('commercial/incentive-runs/', {
        params: { store: storeId, period, ordering: '-updated_at' },
      });
      return response.data;
    },
    enabled: !!storeId && canComputeIncentives && tab === 'incentives',
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
    enabled: !!storeId && canComputeIncentives && tab === 'incentives' && !!selectedRunId,
  });

  useEffect(() => {
    if (!availableTabs.length) return;
    if (!availableTabs.includes(tab)) {
      navigate(tabPath(availableTabs[0]), { replace: true });
    }
  }, [availableTabs, navigate, tab]);

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

  const createProspectMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('commercial/prospects/', {
        store: storeId,
        company_name: prospectForm.company_name.trim(),
        contact_name: prospectForm.contact_name.trim(),
        phone: prospectForm.phone.trim(),
        email: prospectForm.email.trim(),
        estimated_potential: prospectForm.estimated_potential || '0',
        notes: prospectForm.notes.trim(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial', 'prospects', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial', 'prospects-lookup', storeId] }),
      ]);
      toast.success('Prospect cree.');
      setProspectModalOpen(false);
      setProspectForm({
        company_name: '',
        contact_name: '',
        phone: '',
        email: '',
        estimated_potential: '',
        notes: '',
      });
      if (tab !== 'prospects') navigate('/commercial/prospects');
    },
    onError: (error) => toast.error(extractApiError(error, 'Creation prospect impossible.')),
  });

  const qualifyProspectMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      await apiClient.post(`commercial/prospects/${prospectId}/qualify/`, { store: storeId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial', 'prospects', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial', 'prospects-lookup', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial', 'opportunities', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial', 'opportunities-lookup', storeId] }),
      ]);
      toast.success('Prospect qualifie en opportunite.');
      navigate('/commercial');
    },
    onError: (error) => toast.error(extractApiError(error, 'Qualification impossible.')),
  });

  const createOpportunityMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('commercial/opportunities/', {
        store: storeId,
        name: opportunityForm.name.trim(),
        prospect: opportunityForm.prospect || undefined,
        estimated_amount: opportunityForm.estimated_amount || '0',
        probability_pct: Number(opportunityForm.probability_pct || 20),
        expected_close_date: opportunityForm.expected_close_date || null,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial', 'opportunities', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial', 'opportunities-lookup', storeId] }),
      ]);
      toast.success('Opportunite creee.');
      setOpportunityModalOpen(false);
      setOpportunityForm({
        name: '',
        prospect: '',
        estimated_amount: '',
        probability_pct: '20',
        expected_close_date: '',
      });
      if (tab !== 'pipeline') navigate('/commercial');
    },
    onError: (error) => toast.error(extractApiError(error, "Creation d'opportunite impossible.")),
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Utilisateur introuvable.');
      const dueAtIso = new Date(taskForm.due_at_local).toISOString();
      await apiClient.post('commercial/tasks/', {
        store: storeId,
        assigned_to: user.id,
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        due_at: dueAtIso,
        prospect: taskForm.prospect || undefined,
        opportunity: taskForm.opportunity || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['commercial', 'tasks', storeId] });
      toast.success('Relance creee.');
      setTaskModalOpen(false);
      setTaskForm({
        title: '',
        description: '',
        priority: 'MEDIUM',
        due_at_local: '',
        prospect: '',
        opportunity: '',
      });
      if (tab !== 'tasks') navigate('/commercial/tasks');
    },
    onError: (error) => toast.error(extractApiError(error, 'Creation relance impossible.')),
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

  const hasAnyOpportunity = (opportunitiesQuery.data?.results ?? []).length > 0;
  const pipelineError = opportunitiesQuery.isError
    ? extractApiError(opportunitiesQuery.error, 'Chargement du pipeline impossible.')
    : '';
  const prospectsError = prospectsQuery.isError
    ? extractApiError(prospectsQuery.error, 'Chargement des prospects impossible.')
    : '';
  const tasksError = tasksQuery.isError
    ? extractApiError(tasksQuery.error, 'Chargement des relances impossible.')
    : '';
  const incentivesError = incentiveRunsQuery.isError
    ? extractApiError(incentiveRunsQuery.error, 'Chargement des primes impossible.')
    : incentiveResultsQuery.isError
    ? extractApiError(incentiveResultsQuery.error, 'Chargement des resultats impossible.')
    : '';

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  if (!availableTabs.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Permissions insuffisantes pour utiliser le module commercial dans cette boutique.
      </div>
    );
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
        {availableTabs.map((entry) => (
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

      {tab !== 'incentives' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {canManageLeads && (
            <button
              type="button"
              onClick={() => setProspectModalOpen(true)}
              className="px-3 py-2 rounded-lg bg-primary text-white text-sm"
            >
              Nouveau prospect
            </button>
          )}
          {tab === 'pipeline' && canManageOpportunities && (
            <button
              type="button"
              onClick={() => setOpportunityModalOpen(true)}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm"
            >
              Nouvelle opportunite
            </button>
          )}
          {tab === 'tasks' && canLogActivity && (
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm"
            >
              Nouvelle relance
            </button>
          )}
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="space-y-4">
          {pipelineError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pipelineError}
            </div>
          )}
          {opportunitiesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : opportunitiesQuery.isError ? null : (
            <>
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
              {!hasAnyOpportunity && (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 p-4 text-sm text-gray-600 dark:text-gray-300">
                  Pipeline vide. Cree d'abord un prospect, puis clique sur `Qualifier` dans l'onglet Prospects.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'prospects' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {prospectsError && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {prospectsError}
            </div>
          )}
          {prospectsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : prospectsQuery.isError ? null : (
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
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Action</th>
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
                    <td className="px-4 py-3 text-right">
                      {row.status === 'NEW' && canManageOpportunities ? (
                        <button
                          type="button"
                          onClick={() => qualifyProspectMutation.mutate(row.id)}
                          disabled={qualifyProspectMutation.isPending}
                          className="text-xs px-2 py-1 rounded bg-primary text-white disabled:opacity-50"
                        >
                          Qualifier
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(prospectsQuery.data?.results ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Aucun prospect. Utilise `Nouveau prospect` pour commencer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {tasksError && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {tasksError}
            </div>
          )}
          {tasksQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : tasksQuery.isError ? null : (
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
          {incentivesError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {incentivesError}
            </div>
          )}
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
            ) : incentiveRunsQuery.isError || incentiveResultsQuery.isError ? null : (
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

      <Modal open={isProspectModalOpen} title="Nouveau prospect" onClose={() => setProspectModalOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!prospectForm.company_name.trim()) {
              toast.error("Le nom de l'entreprise est obligatoire.");
              return;
            }
            createProspectMutation.mutate();
          }}
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entreprise *</label>
            <input
              value={prospectForm.company_name}
              onChange={(e) => setProspectForm((prev) => ({ ...prev, company_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Contact</label>
              <input
                value={prospectForm.contact_name}
                onChange={(e) => setProspectForm((prev) => ({ ...prev, contact_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Telephone</label>
              <input
                value={prospectForm.phone}
                onChange={(e) => setProspectForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={prospectForm.email}
                onChange={(e) => setProspectForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Potentiel estime</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={prospectForm.estimated_potential}
                onChange={(e) => setProspectForm((prev) => ({ ...prev, estimated_potential: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              value={prospectForm.notes}
              onChange={(e) => setProspectForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              disabled={createProspectMutation.isPending}
              className="px-3 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
            >
              Creer prospect
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={isOpportunityModalOpen} title="Nouvelle opportunite" onClose={() => setOpportunityModalOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!opportunityForm.name.trim()) {
              toast.error("Le nom de l'opportunite est obligatoire.");
              return;
            }
            createOpportunityMutation.mutate();
          }}
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom opportunite *</label>
            <input
              value={opportunityForm.name}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Prospect lie</label>
            <select
              value={opportunityForm.prospect}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, prospect: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Aucun</option>
              {(prospectsLookupQuery.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.company_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Montant estime</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={opportunityForm.estimated_amount}
                onChange={(e) => setOpportunityForm((prev) => ({ ...prev, estimated_amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Probabilite %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={opportunityForm.probability_pct}
                onChange={(e) => setOpportunityForm((prev) => ({ ...prev, probability_pct: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date cloture</label>
              <input
                type="date"
                value={opportunityForm.expected_close_date}
                onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              disabled={createOpportunityMutation.isPending}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
            >
              Creer opportunite
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={isTaskModalOpen} title="Nouvelle relance" onClose={() => setTaskModalOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!taskForm.title.trim()) {
              toast.error('Le titre est obligatoire.');
              return;
            }
            if (!taskForm.due_at_local) {
              toast.error("La date d'echeance est obligatoire.");
              return;
            }
            createTaskMutation.mutate();
          }}
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">Titre *</label>
            <input
              value={taskForm.title}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priorite</label>
              <select
                value={taskForm.priority}
                onChange={(e) =>
                  setTaskForm((prev) => ({ ...prev, priority: e.target.value as TaskFormState['priority'] }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Echeance *</label>
              <input
                type="datetime-local"
                value={taskForm.due_at_local}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, due_at_local: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prospect (optionnel)</label>
              <select
                value={taskForm.prospect}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, prospect: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Aucun</option>
                {(prospectsLookupQuery.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opportunite (optionnel)</label>
              <select
                value={taskForm.opportunity}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, opportunity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Aucune</option>
                {(opportunitiesLookupQuery.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              disabled={createTaskMutation.isPending}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
            >
              Creer relance
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
