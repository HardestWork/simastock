/** Per-store user capability management page (ADMIN / MANAGER). */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeUserApi, storeApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { ArrowLeft, Shield, Users, Check, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { Capability, StoreUserRecord, UserRole } from '@/api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  HR: 'Ressources Humaines',
  COMMERCIAL: 'Commercial',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  HR: 'bg-fuchsia-100 text-fuchsia-700',
  COMMERCIAL: 'bg-indigo-100 text-indigo-700',
  SALES: 'bg-emerald-100 text-emerald-700',
  CASHIER: 'bg-amber-100 text-amber-700',
  STOCKER: 'bg-gray-100 text-gray-700',
};

const CAPABILITY_COLORS: Record<Capability, string> = {
  CAN_MANAGE_USERS: 'bg-violet-100 text-violet-700',
  CAN_MANAGE_STORES: 'bg-sky-100 text-sky-700',
  CAN_MANAGE_SUBSCRIPTIONS: 'bg-cyan-100 text-cyan-700',
  CAN_MANAGE_MODULES: 'bg-fuchsia-100 text-fuchsia-700',
  CAN_SELL: 'bg-emerald-100 text-emerald-700',
  CAN_CASH: 'bg-amber-100 text-amber-700',
  CAN_STOCK: 'bg-sky-100 text-sky-700',
  CAN_REFUND: 'bg-rose-100 text-rose-700',
  CAN_OVERRIDE_PRICE: 'bg-orange-100 text-orange-700',
  CAN_APPROVE: 'bg-violet-100 text-violet-700',
  CAN_VIEW_REPORTS: 'bg-indigo-100 text-indigo-700',
  CAN_CREATE_EXPENSE: 'bg-lime-100 text-lime-700',
  CAN_EDIT_EXPENSE: 'bg-teal-100 text-teal-700',
  CAN_VOID_EXPENSE: 'bg-red-100 text-red-700',
  CAN_VIEW_EXPENSE_REPORTS: 'bg-cyan-100 text-cyan-700',
  CAN_MANAGE_CATEGORIES: 'bg-fuchsia-100 text-fuchsia-700',
  CAN_MANAGE_WALLETS: 'bg-blue-100 text-blue-700',
  CAN_SET_BUDGETS: 'bg-purple-100 text-purple-700',
  CAN_MANAGE_LEADS: 'bg-indigo-100 text-indigo-700',
  CAN_MANAGE_OPPORTUNITIES: 'bg-blue-100 text-blue-700',
  CAN_LOG_ACTIVITY: 'bg-slate-100 text-slate-700',
  CAN_VIEW_COMMERCIAL_TEAM: 'bg-cyan-100 text-cyan-700',
  CAN_APPROVE_COMMERCIAL_BONUS: 'bg-emerald-100 text-emerald-700',
  CAN_EXPORT_COMMERCIAL: 'bg-orange-100 text-orange-700',
  CAN_VIEW_HRM: 'bg-pink-100 text-pink-700',
  CAN_MANAGE_HRM: 'bg-rose-100 text-rose-700',
};

const CAPABILITY_LABELS_FALLBACK: Record<Capability, string> = {
  CAN_MANAGE_USERS: 'Gerer utilisateurs',
  CAN_MANAGE_STORES: 'Gerer boutiques',
  CAN_MANAGE_SUBSCRIPTIONS: 'Gerer abonnements',
  CAN_MANAGE_MODULES: 'Gerer modules payants',
  CAN_SELL: 'Vendre',
  CAN_CASH: 'Encaisser',
  CAN_STOCK: 'Gerer le stock',
  CAN_REFUND: 'Rembourser',
  CAN_OVERRIDE_PRICE: 'Modifier les prix',
  CAN_APPROVE: 'Approuver',
  CAN_VIEW_REPORTS: 'Voir les rapports',
  CAN_CREATE_EXPENSE: 'Creer des depenses',
  CAN_EDIT_EXPENSE: 'Modifier des depenses',
  CAN_VOID_EXPENSE: 'Annuler des depenses',
  CAN_VIEW_EXPENSE_REPORTS: 'Voir rapports depenses',
  CAN_MANAGE_CATEGORIES: 'Gerer categories depenses',
  CAN_MANAGE_WALLETS: 'Gerer wallets',
  CAN_SET_BUDGETS: 'Configurer budgets depenses',
  CAN_MANAGE_LEADS: 'Gerer prospects commerciaux',
  CAN_MANAGE_OPPORTUNITIES: 'Gerer opportunites commerciales',
  CAN_LOG_ACTIVITY: 'Enregistrer activites commerciales',
  CAN_VIEW_COMMERCIAL_TEAM: 'Voir donnees commerciales equipe',
  CAN_APPROVE_COMMERCIAL_BONUS: 'Approuver primes commerciales',
  CAN_EXPORT_COMMERCIAL: 'Exporter donnees commerciales',
  CAN_VIEW_HRM: 'Voir RH',
  CAN_MANAGE_HRM: 'Gerer RH',
};

const ROLE_CAPABILITY_WHITELIST: Record<UserRole, Capability[]> = {
  ADMIN: [
    'CAN_MANAGE_USERS',
    'CAN_MANAGE_STORES',
    'CAN_MANAGE_SUBSCRIPTIONS',
    'CAN_MANAGE_MODULES',
    'CAN_SELL',
    'CAN_CASH',
    'CAN_STOCK',
    'CAN_REFUND',
    'CAN_OVERRIDE_PRICE',
    'CAN_APPROVE',
    'CAN_VIEW_REPORTS',
    'CAN_CREATE_EXPENSE',
    'CAN_EDIT_EXPENSE',
    'CAN_VOID_EXPENSE',
    'CAN_VIEW_EXPENSE_REPORTS',
    'CAN_MANAGE_CATEGORIES',
    'CAN_MANAGE_WALLETS',
    'CAN_SET_BUDGETS',
    'CAN_MANAGE_LEADS',
    'CAN_MANAGE_OPPORTUNITIES',
    'CAN_LOG_ACTIVITY',
    'CAN_VIEW_COMMERCIAL_TEAM',
    'CAN_APPROVE_COMMERCIAL_BONUS',
    'CAN_EXPORT_COMMERCIAL',
    'CAN_VIEW_HRM',
    'CAN_MANAGE_HRM',
  ],
  MANAGER: [
    'CAN_MANAGE_USERS',
    'CAN_MANAGE_STORES',
    'CAN_MANAGE_SUBSCRIPTIONS',
    'CAN_MANAGE_MODULES',
    'CAN_SELL',
    'CAN_CASH',
    'CAN_STOCK',
    'CAN_REFUND',
    'CAN_OVERRIDE_PRICE',
    'CAN_APPROVE',
    'CAN_VIEW_REPORTS',
    'CAN_CREATE_EXPENSE',
    'CAN_EDIT_EXPENSE',
    'CAN_VOID_EXPENSE',
    'CAN_VIEW_EXPENSE_REPORTS',
    'CAN_MANAGE_CATEGORIES',
    'CAN_MANAGE_WALLETS',
    'CAN_SET_BUDGETS',
    'CAN_MANAGE_LEADS',
    'CAN_MANAGE_OPPORTUNITIES',
    'CAN_LOG_ACTIVITY',
    'CAN_VIEW_COMMERCIAL_TEAM',
    'CAN_APPROVE_COMMERCIAL_BONUS',
    'CAN_EXPORT_COMMERCIAL',
    'CAN_VIEW_HRM',
    'CAN_MANAGE_HRM',
  ],
  HR: ['CAN_VIEW_HRM', 'CAN_MANAGE_HRM', 'CAN_VIEW_REPORTS'],
  COMMERCIAL: ['CAN_MANAGE_LEADS', 'CAN_MANAGE_OPPORTUNITIES', 'CAN_LOG_ACTIVITY', 'CAN_EXPORT_COMMERCIAL'],
  SALES: ['CAN_SELL', 'CAN_MANAGE_LEADS', 'CAN_MANAGE_OPPORTUNITIES', 'CAN_LOG_ACTIVITY'],
  CASHIER: ['CAN_CASH', 'CAN_CREATE_EXPENSE', 'CAN_VIEW_EXPENSE_REPORTS'],
  STOCKER: ['CAN_STOCK'],
};

function canAssignCapability(userRole: UserRole, capability: Capability): boolean {
  return ROLE_CAPABILITY_WHITELIST[userRole].includes(capability);
}

function extractApiErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (!data) return err?.message ?? 'Erreur inconnue';
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0]);
  }
  if (Array.isArray(data?.capabilities) && data.capabilities.length > 0) {
    return String(data.capabilities[0]);
  }
  if (typeof data === 'string' && data.trim()) return data;
  return err?.message ?? 'Erreur inconnue';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StoreUserCapabilitiesPage() {
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  // Store selector
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStore?.id ?? '');

  // Edit panel state
  const [editingUser, setEditingUser] = useState<StoreUserRecord | null>(null);
  const [draftCapabilities, setDraftCapabilities] = useState<Capability[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---- Queries ----

  const myStoresQ = useQuery({
    queryKey: queryKeys.myStores,
    queryFn: () => storeApi.myStores(),
  });

  const presetsQ = useQuery({
    queryKey: ['store-users', 'presets'],
    queryFn: () => storeUserApi.presets(),
  });

  // Initialize selected store once myStores load
  useEffect(() => {
    if (!selectedStoreId && myStoresQ.data && myStoresQ.data.length > 0) {
      const def = myStoresQ.data.find((s) => s.id === currentStore?.id) ?? myStoresQ.data[0];
      setSelectedStoreId(def.id);
    }
  }, [myStoresQ.data, selectedStoreId, currentStore?.id]);

  const storeUsersParams: Record<string, string> = {
    page_size: '200',
    ...(selectedStoreId ? { store: selectedStoreId } : {}),
  };

  const storeUsersQ = useQuery({
    queryKey: ['store-users', 'list', storeUsersParams],
    queryFn: () => storeUserApi.list(storeUsersParams),
    enabled: !!selectedStoreId,
  });

  const storeUsers = storeUsersQ.data?.results ?? [];

  const selectedStore = useMemo(
    () => myStoresQ.data?.find((s) => s.id === selectedStoreId) ?? null,
    [myStoresQ.data, selectedStoreId],
  );
  const advancedPermissionsEnabled = Boolean(selectedStore?.effective_feature_flags?.advanced_permissions);

  // ---- Presets & capabilities from API ----

  const presets = presetsQ.data?.presets ?? {};
  const allCapabilities = presetsQ.data?.all_capabilities ?? [];

  // Build a label map from API data, with fallback
  const capabilityLabelMap = useMemo(() => {
    const map: Record<string, string> = { ...CAPABILITY_LABELS_FALLBACK };
    allCapabilities.forEach((c) => {
      map[c.code] = c.label;
    });
    return map;
  }, [allCapabilities]);

  // Ordered list of capability codes to render checkboxes
  const capabilityCodes = useMemo<Capability[]>(() => {
    if (allCapabilities.length > 0) return allCapabilities.map((c) => c.code as Capability);
    return Object.keys(CAPABILITY_LABELS_FALLBACK) as Capability[];
  }, [allCapabilities]);

  // ---- Mutation ----

  const saveMutation = useMutation({
    mutationFn: (args: { id: string; capabilities: Capability[] }) =>
      storeUserApi.update(args.id, { capabilities: args.capabilities }),
    onSuccess: (updated) => {
      toast.success(`Permissions enregistrees: ${updated.user_name} (${selectedStoreName || 'magasin'})`);
      queryClient.invalidateQueries({ queryKey: ['store-users'] });
      setSaveSuccess(true);
      setSaveError('');
      // Refresh the editing user with the server response
      setEditingUser(updated);
      setDraftCapabilities(updated.capabilities);
    },
    onError: (err: any) => {
      const message = extractApiErrorMessage(err);
      toast.error(message || 'Une erreur est survenue');
      setSaveError(message || 'Erreur lors de la sauvegarde.');
      setSaveSuccess(false);
    },
  });

  // ---- Handlers ----

  function openEdit(su: StoreUserRecord) {
    if (!advancedPermissionsEnabled) return;
    setEditingUser(su);
    setDraftCapabilities([...su.capabilities]);
    setSaveError('');
    setSaveSuccess(false);
  }

  function closeEdit() {
    setEditingUser(null);
    setDraftCapabilities([]);
    setSaveError('');
    setSaveSuccess(false);
  }

  function toggleCapability(cap: Capability) {
    setSaveSuccess(false);
    setDraftCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  }

  function applyPreset(presetCaps: Capability[]) {
    setSaveSuccess(false);
    if (!editingUser) return;
    const allowed = presetCaps.filter((cap) => canAssignCapability(editingUser.user_role, cap));
    if (allowed.length < presetCaps.length) {
      toast.error('Certaines permissions du preset ne sont pas autorisees pour ce role.');
    }
    setDraftCapabilities([...allowed]);
  }

  function resetCapabilities() {
    setSaveSuccess(false);
    setDraftCapabilities([]);
  }

  function handleSave() {
    if (!editingUser) return;
    if (!advancedPermissionsEnabled) return;
    const sanitized = draftCapabilities.filter((cap) => canAssignCapability(editingUser.user_role, cap));
    if (sanitized.length < draftCapabilities.length) {
      toast.error('Certaines permissions ne sont pas autorisees pour ce role.');
      setDraftCapabilities(sanitized);
    }
    saveMutation.mutate({ id: editingUser.id, capabilities: sanitized });
  }

  // ---- Selected store label ----

  const selectedStoreName = useMemo(() => {
    if (!myStoresQ.data) return '';
    const s = myStoresQ.data.find((st) => st.id === selectedStoreId);
    return s?.name ?? '';
  }, [myStoresQ.data, selectedStoreId]);

  // ---- Render ----

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/settings/stores"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} className="text-gray-600 dark:text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield size={24} className="text-primary" />
            Permissions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gerez les permissions par utilisateur et par magasin.
          </p>
        </div>
      </div>

      {/* Store selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            Magasin :
          </label>
          <select
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
              closeEdit();
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100 max-w-sm"
          >
            {myStoresQ.isLoading && <option value="">Chargement...</option>}
            {myStoresQ.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.enterprise_name})
              </option>
            ))}
            {myStoresQ.data?.length === 0 && <option value="">Aucun magasin disponible</option>}
          </select>
          {storeUsersQ.data && (
            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
              {storeUsersQ.data.count} utilisateur{storeUsersQ.data.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {!advancedPermissionsEnabled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
          Le mode "Permissions avancees (capacites)" est desactive pour ce magasin. Active-le dans
          Parametres &gt; Magasins &gt; Flags / Modules, puis reviens ici.
        </div>
      )}

      {/* Error loading stores */}
      {myStoresQ.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          Erreur lors du chargement des magasins.
        </div>
      )}

      {/* Main content: table + edit panel */}
      <div className={`grid gap-6 ${editingUser ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
        {/* Users table */}
        <div className={editingUser ? 'lg:col-span-3' : ''}>
          {storeUsersQ.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : storeUsersQ.isError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              Erreur lors du chargement des utilisateurs.
            </div>
          ) : storeUsers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Users size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Aucun utilisateur</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Aucun utilisateur n'est associe a {selectedStoreName || 'ce magasin'}.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">Utilisateur</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Role</th>
                    <th className="px-4 py-3 font-medium">Permissions effectives</th>
                  </tr>
                </thead>
                <tbody>
                  {storeUsers.map((su) => (
                    <tr
                      key={su.id}
                      onClick={() => openEdit(su)}
                      className={`border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                        editingUser?.id === su.id ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{su.user_name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{su.user_email}</div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_CLASSES[su.user_role]}`}
                        >
                          {ROLE_LABELS[su.user_role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {su.effective_capabilities.length === 0 && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 italic">Aucune</span>
                          )}
                          {su.effective_capabilities.map((cap) => (
                            <span
                              key={cap}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CAPABILITY_COLORS[cap] ?? 'bg-gray-100 text-gray-600'}`}
                            >
                              {capabilityLabelMap[cap] ?? cap}
                            </span>
                          ))}
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
        {editingUser && (
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sticky top-4">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Modifier les permissions</h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Fermer"
                >
                  <X size={18} className="text-gray-400" />
                </button>
              </div>

              {/* User info (read-only) */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-5">
                <div className="font-medium text-gray-900 dark:text-gray-100">{editingUser.user_name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{editingUser.user_email}</div>
                <span
                  className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_CLASSES[editingUser.user_role]}`}
                >
                  {ROLE_LABELS[editingUser.user_role]}
                </span>
              </div>

              {/* Presets */}
              {Object.keys(presets).length > 0 && (
                <div className="mb-5">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profils predefinis</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(presets).map(([key, preset]) => {
                      const isActive =
                        preset.capabilities.length === draftCapabilities.length &&
                        preset.capabilities.every((c) => draftCapabilities.includes(c));
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(preset.capabilities)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isActive
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isActive && <Check size={14} />}
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Capability checkboxes */}
              <div className="mb-5">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permissions individuelles</div>
                <div className="space-y-1.5">
                  {capabilityCodes.map((cap) => {
                    const checked = draftCapabilities.includes(cap);
                    const disabledForRole = !canAssignCapability(editingUser.user_role, cap);
                    return (
                      <label
                        key={cap}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                          disabledForRole
                            ? 'border-gray-100 dark:border-gray-700 opacity-60 cursor-not-allowed'
                            : checked
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                        }`}
                        title={disabledForRole ? 'Permission reservee aux roles Administrateur/Gestionnaire' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabledForRole}
                          onChange={() => {
                            if (!disabledForRole) toggleCapability(cap);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                          {capabilityLabelMap[cap] ?? cap}
                        </span>
                        <span
                          className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono ${CAPABILITY_COLORS[cap] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {cap}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Feedback messages */}
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm mb-4">
                  Permissions enregistrees pour {editingUser.user_name}.
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={resetCapabilities}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  title="Reinitialiser (vider les permissions personnalisees)"
                >
                  <RotateCcw size={15} />
                  Reinitialiser
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors ml-auto"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

