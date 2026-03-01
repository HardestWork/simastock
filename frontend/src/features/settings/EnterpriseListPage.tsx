/** Superadmin-only page to manage all enterprises in the SaaS system. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enterpriseApi } from '@/api/endpoints';
import type { Enterprise, EnterpriseResetStockStrategy, EnterpriseResetTarget } from '@/api/types';
import { Building2, Search, Plus, Save, Loader2, Power, Calendar, Store, X, Trash2, AlertCircle, RotateCcw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<Enterprise['subscription_status'], string> = {
  active: 'Actif',
  expired: 'Expire',
  scheduled: 'Planifie',
  inactive: 'Inactif',
};

const STATUS_BADGE_CLASSES: Record<Enterprise['subscription_status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
  scheduled: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-600',
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'expired', label: 'Expires' },
  { value: 'scheduled', label: 'Planifies' },
  { value: 'inactive', label: 'Inactifs' },
];

const RESET_TARGET_OPTIONS: Array<{
  value: EnterpriseResetTarget;
  label: string;
  description: string;
}> = [
  { value: 'sales', label: 'Ventes & devis', description: 'Factures, devis, ventes, remboursements.' },
  { value: 'cashier', label: 'Encaissements', description: 'Paiements et sessions de caisse.' },
  { value: 'credits', label: 'Credits clients', description: 'Comptes credits, echeanciers, ecritures.' },
  { value: 'stock', label: 'Stock operationnel', description: 'Mouvements, transferts, inventaires, niveaux.' },
  { value: 'purchases', label: 'Achats', description: 'Fournisseurs, commandes, receptions.' },
  { value: 'expenses', label: 'Depenses', description: 'Depenses, wallets, budgets, recurrents.' },
  { value: 'commercial', label: 'Commercial CRM', description: 'Pipeline commercial, activites, relances.' },
  { value: 'analytics', label: 'Analytics', description: 'Scores, previsions, snapshots analytics.' },
  { value: 'objectives', label: 'Objectifs', description: 'Regles, stats, leaderboard, sprints.' },
  { value: 'reports', label: 'Rapports', description: 'Snapshots KPI et donnees de reporting.' },
  { value: 'alerts', label: 'Alertes', description: 'Centre d alertes et signaux.' },
  { value: 'audit_logs', label: 'Journal audit', description: 'Historique des actions utilisateurs.' },
  { value: 'sequences', label: 'Sequences docs', description: 'Compteurs numerotation devis/factures.' },
];

const DEFAULT_RESET_TARGETS: EnterpriseResetTarget[] = RESET_TARGET_OPTIONS.map((option) => option.value);

const STOCK_STRATEGY_OPTIONS: Array<{
  value: EnterpriseResetStockStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'keep',
    label: 'Conserver les valeurs (Recommande)',
    description: 'Garde les niveaux de stock pour eviter de bloquer POS/devis.',
  },
  {
    value: 'zero',
    label: 'Remettre a zero',
    description: 'Conserve les lignes de stock mais met quantite et reserve a 0.',
  },
  {
    value: 'delete',
    label: 'Supprimer les lignes',
    description: 'Supprime les lignes de stock (stock non initialise ensuite).',
  },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr });
  } catch {
    return dateStr;
  }
}

function formatSubscription(start: string | null, end: string | null): string {
  if (!start && !end) return '\u2014';
  const s = start ? formatDate(start) : '\u2014';
  const e = end ? formatDate(end) : 'Illimite';
  return `${s} \u2192 ${e}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnterpriseListPage() {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Enterprise | null>(null);

  // Reset
  const [resetTarget, setResetTarget] = useState<Enterprise | null>(null);
  const [resetMode, setResetMode] = useState<'full' | 'transactions'>('transactions');
  const [resetTargets, setResetTargets] = useState<EnterpriseResetTarget[]>(DEFAULT_RESET_TARGETS);
  const [resetStockStrategy, setResetStockStrategy] = useState<EnterpriseResetStockStrategy>('keep');
  const [resetConfirmName, setResetConfirmName] = useState('');

  // Edit panel
  const [editingEnterprise, setEditingEnterprise] = useState<Enterprise | null>(null);
  const [draftSubscriptionStart, setDraftSubscriptionStart] = useState('');
  const [draftSubscriptionEnd, setDraftSubscriptionEnd] = useState('');
  const [draftIsActive, setDraftIsActive] = useState(false);
  const [draftCanCreateStores, setDraftCanCreateStores] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---- Query params ----

  const params: Record<string, string> = { page_size: '100' };
  if (search.trim()) params.search = search.trim();
  if (statusFilter) params.subscription_status = statusFilter;

  // ---- Queries ----

  const enterprisesQ = useQuery({
    queryKey: ['enterprises', 'list', params],
    queryFn: () => enterpriseApi.list(params),
  });

  const enterprises = enterprisesQ.data?.results ?? [];

  // ---- Mutations ----

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => enterpriseApi.toggleActive(id),
    onSuccess: (updated, id) => {
      const enterpriseName = enterprises.find((ent) => ent.id === id)?.name ?? updated.name;
      toast.info(`Statut entreprise mis a jour: ${enterpriseName} (${updated.is_active ? 'active' : 'inactive'})`);
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; data: Partial<Enterprise> }) =>
      enterpriseApi.update(args.id, args.data),
    onSuccess: (updated) => {
      toast.success(`Entreprise mise a jour: ${updated.name}`);
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
      setSaveSuccess(true);
      setSaveError('');
      setEditingEnterprise(updated);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setSaveError(extractApiError(err));
      setSaveSuccess(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => enterpriseApi.delete(id),
    onSuccess: () => {
      toast.warning(`Entreprise supprimee: ${deleteTarget?.name ?? 'sans nom'}`);
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
      setDeleteTarget(null);
      if (editingEnterprise?.id === deleteTarget?.id) closeEdit();
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({
      id,
      mode,
      targets,
      stockStrategy,
    }: {
      id: string;
      mode: 'full' | 'transactions';
      targets: EnterpriseResetTarget[];
      stockStrategy: EnterpriseResetStockStrategy;
    }) =>
      enterpriseApi.reset(id, {
        mode,
        ...(mode === 'transactions' ? { targets, stock_strategy: stockStrategy } : {}),
      }),
    onSuccess: (data) => {
      toast.success(data.detail);
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
      setResetTarget(null);
      setResetConfirmName('');
      setResetMode('transactions');
      setResetTargets(DEFAULT_RESET_TARGETS);
      setResetStockStrategy('keep');
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // ---- Handlers ----

  function openEdit(enterprise: Enterprise) {
    setEditingEnterprise(enterprise);
    setDraftSubscriptionStart(enterprise.subscription_start ?? '');
    setDraftSubscriptionEnd(enterprise.subscription_end ?? '');
    setDraftIsActive(enterprise.is_active);
    setDraftCanCreateStores(enterprise.can_create_stores);
    setSaveError('');
    setSaveSuccess(false);
  }

  function closeEdit() {
    setEditingEnterprise(null);
    setDraftSubscriptionStart('');
    setDraftSubscriptionEnd('');
    setDraftIsActive(false);
    setDraftCanCreateStores(false);
    setSaveError('');
    setSaveSuccess(false);
  }

  function handleSave() {
    if (!editingEnterprise) return;
    setSaveSuccess(false);
    updateMutation.mutate({
      id: editingEnterprise.id,
      data: {
        subscription_start: draftSubscriptionStart || null,
        subscription_end: draftSubscriptionEnd || null,
        is_active: draftIsActive,
        can_create_stores: draftCanCreateStores,
      },
    });
  }

  function handleToggleActive(e: React.MouseEvent, enterprise: Enterprise) {
    e.stopPropagation();
    toggleActiveMutation.mutate(enterprise.id);
  }

  // ---- Render ----

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Building2 size={24} className="text-primary" />
            Gestion des entreprises
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gerez toutes les entreprises de la plateforme, leurs abonnements et permissions.
          </p>
        </div>
        <Link
          to="/settings/enterprise-setup"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={18} />
          Creer une entreprise
        </Link>
      </div>

      {/* Search + Status filter */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou code..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {enterprisesQ.data && (
            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
              {enterprisesQ.data.count} entreprise{enterprisesQ.data.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Toggle-active error */}
      {toggleActiveMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          Erreur lors de la mise a jour du statut.
        </div>
      )}

      {/* Main content: table + edit panel */}
      <div className={`grid gap-6 ${editingEnterprise ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
        {/* Table */}
        <div className={editingEnterprise ? 'lg:col-span-3' : ''}>
          {enterprisesQ.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : enterprisesQ.isError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              Erreur lors du chargement des entreprises.
            </div>
          ) : enterprises.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Building2 size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune entreprise</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Aucune entreprise n'a ete trouvee. Creez-en une pour commencer.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">Entreprise</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Statut</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Abonnement</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Boutiques</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enterprises.map((ent) => (
                    <tr
                      key={ent.id}
                      onClick={() => openEdit(ent)}
                      className={`border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                        editingEnterprise?.id === ent.id
                          ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                          : ''
                      }`}
                    >
                      {/* Enterprise name + code */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{ent.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{ent.code}</div>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[ent.subscription_status]}`}
                        >
                          {STATUS_LABELS[ent.subscription_status]}
                        </span>
                      </td>

                      {/* Subscription period */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <Calendar size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          <span>{formatSubscription(ent.subscription_start, ent.subscription_end)}</span>
                        </div>
                      </td>

                      {/* Can create stores */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Store size={14} className="text-gray-400" />
                          <span className={ent.can_create_stores ? 'text-emerald-600' : 'text-gray-400'}>
                            {ent.can_create_stores ? 'Autorise' : 'Non autorise'}
                          </span>
                        </div>
                      </td>

                      {/* Actions: toggle is_active + delete */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => handleToggleActive(e, ent)}
                            disabled={toggleActiveMutation.isPending}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              ent.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                            title={ent.is_active ? 'Desactiver' : 'Activer'}
                          >
                            <Power size={14} />
                            {ent.is_active ? 'Actif' : 'Inactif'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setResetTarget(ent);
                              setResetMode('transactions');
                              setResetTargets(DEFAULT_RESET_TARGETS);
                              setResetStockStrategy('keep');
                              setResetConfirmName('');
                            }}
                            className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                            title="Reinitialiser l'entreprise"
                          >
                            <RotateCcw size={15} className="text-amber-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(ent);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Supprimer l'entreprise"
                          >
                            <Trash2 size={15} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit panel */}
        {editingEnterprise && (
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sticky top-4">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Modifier l'entreprise</h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Fermer"
                >
                  <X size={18} className="text-gray-400" />
                </button>
              </div>

              {/* Enterprise info (read-only) */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-5">
                <div className="font-medium text-gray-900 dark:text-gray-100">{editingEnterprise.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{editingEnterprise.code}</div>
                <span
                  className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[editingEnterprise.subscription_status]}`}
                >
                  {STATUS_LABELS[editingEnterprise.subscription_status]}
                </span>
              </div>

              {/* Subscription dates */}
              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Debut d'abonnement
                  </label>
                  <input
                    type="date"
                    value={draftSubscriptionStart}
                    onChange={(e) => {
                      setDraftSubscriptionStart(e.target.value);
                      setSaveSuccess(false);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fin d'abonnement
                  </label>
                  <input
                    type="date"
                    value={draftSubscriptionEnd}
                    onChange={(e) => {
                      setDraftSubscriptionEnd(e.target.value);
                      setSaveSuccess(false);
                    }}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Laisser vide pour un abonnement illimite.
                  </p>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4 mb-5">
                {/* is_active toggle */}
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Entreprise active</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Desactiver empeche l'acces a toute l'entreprise.
                    </div>
                  </div>
                  <div className="relative flex-shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={draftIsActive}
                      onChange={(e) => {
                        setDraftIsActive(e.target.checked);
                        setSaveSuccess(false);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                  </div>
                </label>

                {/* can_create_stores toggle */}
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Creation de boutiques</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Autoriser l'ajout de nouvelles boutiques.
                    </div>
                  </div>
                  <div className="relative flex-shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={draftCanCreateStores}
                      onChange={(e) => {
                        setDraftCanCreateStores(e.target.checked);
                        setSaveSuccess(false);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                  </div>
                </label>
              </div>

              {/* Feedback messages */}
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm mb-4">
                  Configuration enregistree pour {editingEnterprise.name}.
                </div>
              )}

              {/* Save button */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Supprimer l'entreprise
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              Etes-vous sur de vouloir supprimer{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {deleteTarget.name}
              </span>{' '}
              ({deleteTarget.code}) ?
            </p>
            <p className="text-xs text-red-600 mb-5">
              Cette action supprimera toutes les boutiques, utilisateurs, produits, ventes et donnees associees. Cette action est irreversible.
            </p>

            {deleteMutation.isError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
                <AlertCircle size={14} />
                {extractApiError(deleteMutation.error)}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); deleteMutation.reset(); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                disabled={deleteMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-amber-500 mt-0.5">
                <RotateCcw size={20} />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Reinitialiser l'entreprise
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {resetTarget.name} ({resetTarget.code})
                </p>
              </div>
            </div>

            {/* Mode selection */}
            <div className="space-y-3 mb-5">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode de reinitialisation</p>

              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-900/20">
                <input
                  type="radio"
                  name="resetMode"
                  value="transactions"
                  checked={resetMode === 'transactions'}
                  onChange={() => setResetMode('transactions')}
                  className="mt-0.5 accent-amber-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Transactions uniquement</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Reinitialisation transactionnelle configurable (vous choisissez les blocs a supprimer).
                    La structure (produits, clients, utilisateurs, boutiques) est conservee.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 has-[:checked]:border-red-400 has-[:checked]:bg-red-50 dark:has-[:checked]:bg-red-900/20">
                <input
                  type="radio"
                  name="resetMode"
                  value="full"
                  checked={resetMode === 'full'}
                  onChange={() => setResetMode('full')}
                  className="mt-0.5 accent-red-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Reinitialisation complete</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Supprime TOUT : produits, clients, utilisateurs (sauf superadmins), roles,
                    ainsi que toutes les transactions. L'entreprise repart de zero.
                  </div>
                </div>
              </label>
            </div>

            {resetMode === 'transactions' && (
              <>
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Blocs a supprimer</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setResetTargets(DEFAULT_RESET_TARGETS)}
                        className="text-xs text-primary hover:underline"
                      >
                        Tout cocher
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetTargets([])}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Tout decocher
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-gray-200 dark:border-gray-600 p-2">
                    {RESET_TARGET_OPTIONS.map((option) => {
                      const checked = resetTargets.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setResetTargets((prev) => Array.from(new Set([...prev, option.value])));
                              } else {
                                setResetTargets((prev) => prev.filter((value) => value !== option.value));
                              }
                            }}
                            className="mt-0.5 accent-amber-600"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                              {option.label}
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {option.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {resetTargets.includes('stock') && (
                  <div className="mb-5 space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Traitement des valeurs stock</p>
                    {STOCK_STRATEGY_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <input
                          type="radio"
                          name="stockStrategy"
                          value={option.value}
                          checked={resetStockStrategy === option.value}
                          onChange={() => setResetStockStrategy(option.value)}
                          className="mt-0.5 accent-amber-600"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            {option.label}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Confirm by typing name */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tapez <span className="font-bold text-gray-900 dark:text-gray-100">{resetTarget.name}</span> pour confirmer
              </label>
              <input
                type="text"
                value={resetConfirmName}
                onChange={(e) => setResetConfirmName(e.target.value)}
                placeholder={resetTarget.name}
                className={inputClass}
              />
            </div>

            {resetMutation.isError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
                <AlertCircle size={14} />
                {extractApiError(resetMutation.error)}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setResetTarget(null);
                  setResetConfirmName('');
                  setResetMode('transactions');
                  setResetTargets(DEFAULT_RESET_TARGETS);
                  setResetStockStrategy('keep');
                  resetMutation.reset();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                disabled={resetMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  resetMutation.mutate({
                    id: resetTarget.id,
                    mode: resetMode,
                    targets: resetTargets,
                    stockStrategy: resetStockStrategy,
                  })
                }
                disabled={
                  resetMutation.isPending
                  || resetConfirmName !== resetTarget.name
                  || (resetMode === 'transactions' && resetTargets.length === 0)
                }
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60 transition-colors ${
                  resetMode === 'full'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {resetMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Reinitialisation...
                  </span>
                ) : (
                  'Reinitialiser'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
