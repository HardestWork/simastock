/** Superadmin-only page to manage all enterprises in the SaaS system. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enterpriseApi } from '@/api/endpoints';
import type { Enterprise } from '@/api/types';
import { Building2, Search, Plus, Save, Loader2, Power, Calendar, Store, X, Trash2, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';
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

function extractError(err: unknown): string {
  const ax = err as { response?: { data?: Record<string, unknown> | string } };
  const data = ax?.response?.data;
  if (data) {
    if (typeof data === 'string') return 'Erreur serveur. Veuillez reessayer.';
    if (typeof data.detail === 'string') return data.detail;
    const msgs: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val)) msgs.push(`${key}: ${val.join(', ')}`);
      else if (typeof val === 'string') msgs.push(`${key}: ${val}`);
    }
    if (msgs.length) return msgs.join(' | ');
  }
  return 'Une erreur est survenue. Veuillez reessayer.';
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
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
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
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setSaveError(extractError(err));
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
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
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
                {extractError(deleteMutation.error)}
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
    </div>
  );
}

