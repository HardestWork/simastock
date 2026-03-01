/** Admin settings: stores, invoice (enterprise-level), enterprise flags. */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

import { enterpriseApi, storeApi } from '@/api/endpoints';
import type { Enterprise, FeatureFlags, Store } from '@/api/types';
import { FEATURE_FLAG_KEYS, FEATURE_FLAG_LABELS, type OverrideMode } from '@/lib/feature-flags';

function normalizeFlags(flags?: FeatureFlags): FeatureFlags {
  return (flags && typeof flags === 'object') ? flags : {};
}

function normalizeOverrides(overrides?: FeatureFlags): FeatureFlags {
  return (overrides && typeof overrides === 'object') ? overrides : {};
}

function overrideModeFor(key: keyof FeatureFlags, overrides: FeatureFlags): OverrideMode {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key] ? 'enabled' : 'disabled';
  }
  return 'inherit';
}

function setOverrideMode(key: string, mode: OverrideMode, overrides: FeatureFlags): FeatureFlags {
  const next: FeatureFlags = { ...overrides };
  if (mode === 'inherit') {
    delete (next as any)[key];
    return next;
  }
  (next as any)[key] = mode === 'enabled';
  return next;
}

type Tab = 'stores' | 'invoice' | 'enterprise';

function tabFromPath(pathname: string): Tab {
  if (pathname.startsWith('/settings/invoice')) return 'invoice';
  if (pathname.startsWith('/settings/structure')) return 'enterprise';
  return 'stores';
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const activeTab = tabFromPath(location.pathname);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  const enterpriseQ = useQuery({
    queryKey: ['settings', 'enterprise'],
    queryFn: () => enterpriseApi.list(),
  });
  const storesQ = useQuery({
    queryKey: ['settings', 'stores'],
    queryFn: () => storeApi.list({ page_size: '200', ordering: 'name' }),
  });

  const enterprise: Enterprise | null = enterpriseQ.data?.results?.[0] ?? null;
  const stores: Store[] = storesQ.data?.results ?? [];

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [selectedStoreId, stores]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  // --- Store draft ---
  const [storeDraft, setStoreDraft] = useState<Partial<Store>>({});
  useEffect(() => {
    if (selectedStore) {
      setStoreDraft({
        name: selectedStore.name,
        code: selectedStore.code,
        address: selectedStore.address,
        phone: selectedStore.phone,
        email: selectedStore.email,
        website: selectedStore.website ?? '',
        vat_enabled: selectedStore.vat_enabled,
        vat_rate: selectedStore.vat_rate,
        analytics_feature_overrides: normalizeOverrides(selectedStore.analytics_feature_overrides),
      });
    }
  }, [selectedStore]);

  // --- Invoice draft (enterprise-level) ---
  const [invoiceDraft, setInvoiceDraft] = useState<Partial<Enterprise>>({});
  useEffect(() => {
    if (enterprise) {
      setInvoiceDraft({
        bank_details: enterprise.bank_details ?? '',
        invoice_header: enterprise.invoice_header ?? 'FACTURE',
        invoice_template: enterprise.invoice_template ?? 'CLASSIC',
        invoice_primary_color: enterprise.invoice_primary_color ?? '#0F4C9A',
        invoice_secondary_color: enterprise.invoice_secondary_color ?? '#21A8F6',
        offer_validity_days: enterprise.offer_validity_days ?? 15,
        invoice_terms: enterprise.invoice_terms ?? '',
        invoice_footer: enterprise.invoice_footer ?? '',
      });
    }
  }, [enterprise?.id]);

  // --- Enterprise flags draft ---
  const [enterpriseFlagsDraft, setEnterpriseFlagsDraft] = useState<FeatureFlags>({});
  useEffect(() => {
    if (enterprise) {
      setEnterpriseFlagsDraft(normalizeFlags(enterprise.analytics_feature_flags));
    }
  }, [enterprise?.id]);

  // --- Mutations ---
  const saveStoreMut = useMutation({
    mutationFn: async () => {
      if (!selectedStore) throw new Error('Aucun magasin selectionne.');
      return storeApi.update(selectedStore.id, storeDraft);
    },
    onSuccess: () => {
      toast.info(`Magasin mis a jour: ${selectedStore?.name ?? 'selection courante'}`);
      qc.invalidateQueries({ queryKey: ['settings', 'stores'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const saveInvoiceMut = useMutation({
    mutationFn: async () => {
      if (!enterprise) throw new Error('Aucune structure.');
      return enterpriseApi.update(enterprise.id, invoiceDraft);
    },
    onSuccess: () => {
      toast.success(`Parametres de facturation enregistres (${enterprise?.name ?? 'structure'}).`);
      qc.invalidateQueries({ queryKey: ['settings', 'enterprise'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const saveEnterpriseMut = useMutation({
    mutationFn: async () => {
      if (!enterprise) throw new Error('Aucune structure.');
      const payload: Partial<Enterprise> = { analytics_feature_flags: enterpriseFlagsDraft };
      return enterpriseApi.update(enterprise.id, payload);
    },
    onSuccess: () => {
      toast.success(`Flags structure enregistres: ${enterprise?.name ?? 'structure'}`);
      qc.invalidateQueries({ queryKey: ['settings', 'enterprise'] });
      qc.invalidateQueries({ queryKey: ['settings', 'stores'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // --- Create store ---
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', code: '', address: '', phone: '', email: '' });

  const canCreateStores = enterprise != null && enterprise.can_create_stores !== false;

  const createStoreMut = useMutation({
    mutationFn: () => storeApi.create(newStore),
    onSuccess: (createdStore) => {
      toast.success(`Boutique creee: ${createdStore.name}`);
      qc.invalidateQueries({ queryKey: ['settings', 'stores'] });
      qc.invalidateQueries({ queryKey: ['my-stores'] });
      setShowCreateForm(false);
      setNewStore({ name: '', code: '', address: '', phone: '', email: '' });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const globalError =
    (enterpriseQ.isError ? extractApiError(enterpriseQ.error) : null) ??
    (storesQ.isError ? extractApiError(storesQ.error) : null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {activeTab === 'stores' && 'Magasins'}
          {activeTab === 'invoice' && 'Facturation'}
          {activeTab === 'enterprise' && 'Structure'}
        </h1>
        <button
          type="button"
          onClick={() => { enterpriseQ.refetch(); storesQ.refetch(); }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {globalError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: Magasins                                                  */}
      {/* ============================================================= */}
      {activeTab === 'stores' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Liste</div>
              {canCreateStores && !showCreateForm && (
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-xs hover:bg-primary/90 transition-colors"
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              )}
            </div>

            {/* Create store form */}
            {showCreateForm && (
              <div className="mb-3 border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Nouvelle boutique</div>
                  <button type="button" onClick={() => { setShowCreateForm(false); createStoreMut.reset(); }} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>
                <input
                  placeholder="Nom *"
                  value={newStore.name}
                  onChange={(e) => setNewStore((d) => ({ ...d, name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  placeholder="Code *"
                  value={newStore.code}
                  onChange={(e) => setNewStore((d) => ({ ...d, code: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  placeholder="Adresse (optionnel)"
                  value={newStore.address}
                  onChange={(e) => setNewStore((d) => ({ ...d, address: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  placeholder="Telephone (optionnel)"
                  value={newStore.phone}
                  onChange={(e) => setNewStore((d) => ({ ...d, phone: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  placeholder="Email (optionnel)"
                  value={newStore.email}
                  onChange={(e) => setNewStore((d) => ({ ...d, email: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
                {createStoreMut.isError && (
                  <div className="text-xs text-red-600">{extractApiError(createStoreMut.error)}</div>
                )}
                <button
                  type="button"
                  onClick={() => createStoreMut.mutate()}
                  disabled={!newStore.name.trim() || !newStore.code.trim() || createStoreMut.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {createStoreMut.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Creation...</>
                  ) : (
                    <><Plus size={14} /> Creer la boutique</>
                  )}
                </button>
              </div>
            )}

            {storesQ.isLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
            ) : (
              <div className="space-y-1">
                {stores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStoreId(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                      s.id === selectedStoreId ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{s.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{s.code}</div>
                  </button>
                ))}
                {stores.length === 0 && <div className="text-sm text-gray-500">Aucun magasin.</div>}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {!selectedStore ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
                Selectionnez un magasin.
              </div>
            ) : (
              <>
                {/* Store info */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedStore.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Configuration magasin</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveStoreMut.mutate()}
                      disabled={saveStoreMut.isPending}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-60"
                    >
                      <Save size={16} />
                      {saveStoreMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>

                  {saveStoreMut.isError && (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {extractApiError(saveStoreMut.error)}
                    </div>
                  )}
                  {saveStoreMut.isSuccess && (
                    <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                      Configuration magasin enregistree.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nom</label>
                      <input
                        value={storeDraft.name ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Code</label>
                      <input
                        value={storeDraft.code ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telephone</label>
                      <input
                        value={storeDraft.phone ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                      <input
                        value={storeDraft.email ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Adresse</label>
                      <input
                        value={storeDraft.address ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, address: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Flags / Modules */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Flags / Modules</div>
                  <div className="space-y-2">
                    {FEATURE_FLAG_KEYS.map((key) => {
                      const overrides = normalizeOverrides(storeDraft.analytics_feature_overrides);
                      const mode = overrideModeFor(key, overrides);
                      const effective = selectedStore.effective_feature_flags?.[key];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{FEATURE_FLAG_LABELS[key]}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Effectif: {effective === false ? 'Desactive' : 'Active'}
                            </div>
                          </div>
                          <select
                            value={mode}
                            onChange={(e) => {
                              const nextMode = e.target.value as OverrideMode;
                              setStoreDraft((d) => ({
                                ...d,
                                analytics_feature_overrides: setOverrideMode(
                                  key,
                                  nextMode,
                                  normalizeOverrides(d.analytics_feature_overrides),
                                ),
                              }));
                            }}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="inherit">Heriter</option>
                            <option value="enabled">Activer</option>
                            <option value="disabled">Desactiver</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: Facturation (niveau structure)                            */}
      {/* ============================================================= */}
      {activeTab === 'invoice' && (
        <div className="max-w-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-gray-900">Facturation</div>
                <div className="text-xs text-gray-500">
                  Configuration des factures pour {enterprise?.name ?? 'la structure'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => saveInvoiceMut.mutate()}
                disabled={saveInvoiceMut.isPending || !enterprise}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-60"
              >
                <Save size={16} />
                {saveInvoiceMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>

            {saveInvoiceMut.isError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {extractApiError(saveInvoiceMut.error)}
              </div>
            )}
            {saveInvoiceMut.isSuccess && (
              <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                Parametres de facturation enregistres.
              </div>
            )}

            {!enterprise ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Aucune structure chargee.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Titre facture</label>
                  <input
                    value={invoiceDraft.invoice_header ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_header: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modele</label>
                  <select
                    value={invoiceDraft.invoice_template ?? 'CLASSIC'}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_template: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="CLASSIC">Classique</option>
                    <option value="MODERN">Moderne</option>
                    <option value="SIMPLE">Simple</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Couleur primaire</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={invoiceDraft.invoice_primary_color ?? '#0F4C9A'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_primary_color: e.target.value }))}
                      className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      value={invoiceDraft.invoice_primary_color ?? '#0F4C9A'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_primary_color: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Couleur secondaire</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={invoiceDraft.invoice_secondary_color ?? '#21A8F6'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_secondary_color: e.target.value }))}
                      className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      value={invoiceDraft.invoice_secondary_color ?? '#21A8F6'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_secondary_color: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Validite devis (jours)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={invoiceDraft.offer_validity_days ?? 15}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, offer_validity_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Coordonnees bancaires</label>
                  <input
                    value={invoiceDraft.bank_details ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, bank_details: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Conditions</label>
                  <textarea
                    value={invoiceDraft.invoice_terms ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_terms: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-h-24 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pied de page</label>
                  <textarea
                    value={invoiceDraft.invoice_footer ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_footer: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-h-20 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: Structure (flags globaux)                                 */}
      {/* ============================================================= */}
      {activeTab === 'enterprise' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-semibold text-gray-900">{enterprise?.name ?? 'Structure'}</div>
              <div className="text-xs text-gray-500">Flags globaux (niveau structure)</div>
            </div>
            <button
              type="button"
              onClick={() => saveEnterpriseMut.mutate()}
              disabled={saveEnterpriseMut.isPending || !enterprise}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-60"
            >
              <Save size={16} />
              {saveEnterpriseMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>

          {saveEnterpriseMut.isError && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {extractApiError(saveEnterpriseMut.error)}
            </div>
          )}
          {saveEnterpriseMut.isSuccess && (
            <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
              Flags structure enregistres.
            </div>
          )}

          {!enterprise ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune structure chargee.</div>
          ) : (
            <div className="space-y-2">
              {FEATURE_FLAG_KEYS.map((key) => {
                const effective = enterprise.effective_feature_flags?.[key];
                const current = enterpriseFlagsDraft?.[key];
                return (
                  <label key={key} className="flex items-center justify-between gap-3 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{FEATURE_FLAG_LABELS[key]}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Effectif: {effective === false ? 'Desactive' : 'Active'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={current ?? true}
                      onChange={(e) => setEnterpriseFlagsDraft((d) => ({ ...d, [key]: e.target.checked }))}
                      className="h-5 w-5"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

