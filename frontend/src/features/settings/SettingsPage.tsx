/** Admin settings: stores, invoice (enterprise-level), enterprise flags. */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Plus, X, Loader2, Check, BellRing } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { usePushNotifications } from '@/hooks/usePushNotifications';

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

// ---- Invoice template picker ------------------------------------------------

const INVOICE_TEMPLATES = [
  { id: 'CLASSIC',   name: 'Classique',  desc: 'Standard épuré' },
  { id: 'MODERN',    name: 'Moderne',    desc: 'Gradient premium' },
  { id: 'SIMPLE',    name: 'Simple',     desc: 'Minimaliste' },
  { id: 'CORPORATE', name: 'Corporate',  desc: 'Bande colorée' },
  { id: 'BORDERED',  name: 'Structuré',  desc: 'Grille bordérée' },
  { id: 'PRESTIGE',  name: 'Prestige',   desc: 'Sidebar couleur' },
] as const;

function TemplateMiniPreview({ template, color }: { template: string; color: string }) {
  const c = color || '#0F4C9A';
  const base = 'w-full rounded overflow-hidden bg-white border border-gray-100';
  const line = (w: string, op = '1') =>
    <div style={{ height: 5, background: `rgba(0,0,0,${op})`, borderRadius: 2, marginBottom: 3, width: w }} />;

  if (template === 'CLASSIC') return (
    <div className={base} style={{ aspectRatio: '1/1.41' }}>
      <div style={{ background: c, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
        <div style={{ width: 20, height: 8, background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
        <div style={{ width: 28, height: 8, background: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
      </div>
      <div style={{ padding: '6px 6px 4px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {[1,2].map(i => <div key={i} style={{ flex: 1, background: '#f3f4f6', borderRadius: 2, padding: '4px 4px' }}>{line('70%')}{line('50%', '0.3')}</div>)}
        </div>
        <div style={{ background: c, height: 8, borderRadius: 2, marginBottom: 3 }} />
        {[1,2,3].map(i => <div key={i} style={{ display:'flex', gap:4, borderBottom:'1px solid #f0f0f0', padding:'3px 0' }}>
          {line('40%', '0.5')}<div style={{flex:1}}/>{line('20%', '0.4')}
        </div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <div style={{ width: 60, background: '#f9fafb', borderRadius: 2, padding: 4 }}>
            {line('100%', '0.3')}{line('100%', '0.3')}
            <div style={{ height: 7, background: c, borderRadius: 2, marginTop: 3 }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (template === 'MODERN') return (
    <div className={base} style={{ aspectRatio: '1/1.41', background: '#0f172a' }}>
      <div style={{ background: `linear-gradient(135deg, ${c}, #6366f1)`, height: 28, display: 'flex', alignItems: 'flex-end', padding: '0 6px 4px' }}>
        <div style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 }}>FACTURE</div>
      </div>
      <div style={{ background: '#1e293b', padding: '6px 6px 4px', flex: 1 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {[1,2].map(i => <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 2, padding: '4px 4px' }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, marginBottom: 3, width: '70%' }} />
            <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, width: '50%' }} />
          </div>)}
        </div>
        {[1,2,3].map(i => <div key={i} style={{ display:'flex', gap:4, borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'3px 0' }}>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, width: '40%' }} />
          <div style={{flex:1}}/>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, width: '20%' }} />
        </div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div style={{ height: 8, background: `linear-gradient(90deg, ${c}, #6366f1)`, borderRadius: 4, width: 50 }} />
        </div>
      </div>
    </div>
  );

  if (template === 'SIMPLE') return (
    <div className={base} style={{ aspectRatio: '1/1.41', padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
        <div style={{ width: 24, height: 24, background: c, borderRadius: 4 }} />
        <div>
          {line('100%', '0.6')}
          {line('80%', '0.3')}
        </div>
      </div>
      <div style={{ borderTop: `2px solid ${c}`, paddingTop: 6, marginBottom: 6 }}>
        {line('60%', '0.5')}{line('40%', '0.3')}
      </div>
      {[1,2,3].map(i => <div key={i} style={{ display:'flex', gap:4, padding:'3px 0', borderBottom:'1px solid #f0f0f0' }}>
        {line('40%', '0.5')}<div style={{flex:1}}/>{line('25%', '0.5')}
      </div>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <div style={{ width: 56, borderTop: `2px solid ${c}`, paddingTop: 3 }}>
          <div style={{ height: 6, background: c, borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );

  if (template === 'CORPORATE') return (
    <div className={base} style={{ aspectRatio: '1/1.41' }}>
      <div style={{ background: c, padding: '8px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: 22, height: 10, background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.9)', borderRadius: 1, width: 36, marginBottom: 2 }} />
          <div style={{ height: 4, background: 'rgba(255,255,255,0.5)', borderRadius: 1, width: 26 }} />
        </div>
      </div>
      <div style={{ padding: '5px 6px' }}>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #dde1ea', borderRadius: 2, marginBottom: 5, overflow: 'hidden' }}>
          {[1,2,3].map(i => <div key={i} style={{ flex:1, padding:'4px 4px', borderRight: i<3 ? '1px solid #dde1ea':undefined }}>
            <div style={{ height: 3, background: c, borderRadius: 1, width: '60%', marginBottom: 3 }} />
            {line('80%', '0.4')}{line('55%', '0.25')}
          </div>)}
        </div>
        <div style={{ background: c, height: 7, borderRadius: 2, marginBottom: 4 }} />
        {[1,2,3].map(i => <div key={i} style={{ display:'flex', gap:4, borderBottom:'1px solid #f0f0f0', padding:'3px 0' }}>
          {line('40%', '0.5')}<div style={{flex:1}}/>{line('22%', '0.5')}
        </div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
          <div style={{ background: c, height: 8, borderRadius: 2, width: 52, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.85)', borderRadius: 1, width: 34 }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (template === 'BORDERED') return (
    <div className={base} style={{ aspectRatio: '1/1.41' }}>
      <div style={{ display: 'flex', border: '1.5px solid #222', margin: 6, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 45%', padding: '6px 6px', borderRight: '1.5px solid #222' }}>
          {line('60%')}{line('80%', '0.4')}{line('55%', '0.3')}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: c, padding: '4px 6px', borderBottom: '1.5px solid #222', display:'flex', justifyContent:'space-between' }}>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.9)', borderRadius: 1, width: 32 }} />
            <div style={{ height: 5, background: 'rgba(255,255,255,0.5)', borderRadius: 10, width: 22 }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ flex:'0 0 50%', padding:'3px 4px', borderRight:i%2===1?'1px solid #e0e4ed':undefined, borderBottom:'1px solid #e0e4ed' }}>
              <div style={{ height: 3, background: '#ccc', borderRadius: 1, width: '50%', marginBottom: 2 }} />
              <div style={{ height: 4, background: '#444', borderRadius: 1, width: '70%' }} />
            </div>)}
          </div>
        </div>
      </div>
      <div style={{ margin: '0 6px' }}>
        <div style={{ border: '1px solid #c8cdd8' }}>
          <div style={{ background: '#f5f6fa', height: 8, borderBottom: '1px solid #c8cdd8' }} />
          {[1,2,3].map(i => <div key={i} style={{ height: 9, borderBottom: '1px solid #d8dce8', background: i%2===0 ? '#fafbfe' : '#fff' }} />)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <div style={{ width: 55, border: '1px solid #c8cdd8' }}>
            {[1,2].map(i => <div key={i} style={{ height: 6, borderBottom: '1px solid #e0e4ed', background: '#fff' }} />)}
            <div style={{ height: 8, background: c }} />
          </div>
        </div>
      </div>
    </div>
  );

  // PRESTIGE
  return (
    <div className={base} style={{ aspectRatio: '1/1.41', display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 12, background: c, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 5, height: 32, background: 'rgba(255,255,255,0.18)', borderRadius: 10 }} />
      </div>
      <div style={{ flex: 1, padding: '6px 6px 4px' }}>
        <div style={{ borderBottom: `2px solid ${c}`, paddingBottom: 5, marginBottom: 5, display:'flex', justifyContent:'space-between' }}>
          <div>
            <div style={{ height: 7, background: c, borderRadius: 1, width: 48, marginBottom: 3 }} />
            {line('65%', '0.4')}{line('45%', '0.3')}
          </div>
          <div style={{ textAlign:'right' }}>{line('60%', '0.6')}{line('45%', '0.3')}</div>
        </div>
        <div style={{ display:'flex', gap:3, marginBottom:5 }}>
          {[1,2,3].map(i => <div key={i} style={{ flex:1, background:'#f5f7fb', borderRadius:2, padding:'3px 3px' }}>
            <div style={{ height: 3, background: c, borderRadius: 1, width:'60%', marginBottom: 2 }} />
            {line('80%', '0.5')}{line('55%', '0.3')}
          </div>)}
        </div>
        <div style={{ background: c, height: 7, borderRadius: 2, marginBottom: 3 }} />
        {[1,2,3].map(i => <div key={i} style={{ display:'flex', gap:4, borderBottom:'1px solid #eef0f5', padding:'3px 0' }}>
          {line('40%', '0.5')}<div style={{flex:1}}/>{line('22%', '0.5')}
        </div>)}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
          <div style={{ background: c, height: 8, borderRadius: 3, width: 52 }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
        address: enterprise.address ?? '',
        phone: enterprise.phone ?? '',
        email: enterprise.email ?? '',
        website: enterprise.website ?? '',
        legal_name: enterprise.legal_name ?? '',
        legal_form: enterprise.legal_form ?? '',
        share_capital: enterprise.share_capital ?? '',
        registration_number: enterprise.registration_number ?? '',
        tax_id: enterprise.tax_id ?? '',
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
                      <label htmlFor="store-name" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nom</label>
                      <input
                        id="store-name"
                        value={storeDraft.name ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="store-code" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Code</label>
                      <input
                        id="store-code"
                        value={storeDraft.code ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="store-phone" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telephone</label>
                      <input
                        id="store-phone"
                        value={storeDraft.phone ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="store-email" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                      <input
                        id="store-email"
                        value={storeDraft.email ?? ''}
                        onChange={(e) => setStoreDraft((d) => ({ ...d, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="store-address" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Adresse</label>
                      <input
                        id="store-address"
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
              <div className="space-y-4">

              {/* ---- Coordonnees ---- */}
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">
                  Coordonnees
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label htmlFor="inv-address" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Adresse / Localisation</label>
                    <textarea
                      id="inv-address"
                      value={invoiceDraft.address ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, address: e.target.value }))}
                      placeholder="Ex : Somgade - Ouagadougou, Burkina Faso"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 resize-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-phone" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telephone</label>
                    <input
                      id="inv-phone"
                      value={invoiceDraft.phone ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, phone: e.target.value }))}
                      placeholder="+226 XX XX XX XX"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-email" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                    <input
                      id="inv-email"
                      type="email"
                      value={invoiceDraft.email ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, email: e.target.value }))}
                      placeholder="contact@entreprise.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* ---- Identite legale SYSCOHADA ---- */}
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">
                  Identite legale (SYSCOHADA)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label htmlFor="inv-legal-name" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Raison sociale</label>
                    <input
                      id="inv-legal-name"
                      value={invoiceDraft.legal_name ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, legal_name: e.target.value }))}
                      placeholder="Ex : TechXperts Solutions"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-legal-form" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Forme juridique</label>
                    <select
                      id="inv-legal-form"
                      value={invoiceDraft.legal_form ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, legal_form: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="">-- Selectionner --</option>
                      <option value="SARL">SARL</option>
                      <option value="SA">SA</option>
                      <option value="SAS">SAS</option>
                      <option value="SNC">SNC</option>
                      <option value="SCS">SCS</option>
                      <option value="GIE">GIE</option>
                      <option value="EI">Entreprise individuelle</option>
                      <option value="AUTRE">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inv-share-capital" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Capital social</label>
                    <input
                      id="inv-share-capital"
                      value={invoiceDraft.share_capital ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, share_capital: e.target.value }))}
                      placeholder="Ex : 1 000 000 FCFA"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-rccm" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RCCM</label>
                    <input
                      id="inv-rccm"
                      value={invoiceDraft.registration_number ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, registration_number: e.target.value }))}
                      placeholder="Ex : BF-OUA-2024-B-12345"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-tax-id" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">NIF / IFU</label>
                    <input
                      id="inv-tax-id"
                      value={invoiceDraft.tax_id ?? ''}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, tax_id: e.target.value }))}
                      placeholder="Ex : 00123456T"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* ---- Mise en page / facturation ---- */}
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">
                  Mise en page
                </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inv-header" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Titre facture</label>
                  <input
                    id="inv-header"
                    value={invoiceDraft.invoice_header ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_header: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Modèle de facture</label>
                  <div className="grid grid-cols-3 gap-3">
                    {INVOICE_TEMPLATES.map((tpl) => {
                      const selected = (invoiceDraft.invoice_template ?? 'CLASSIC') === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setInvoiceDraft((d) => ({ ...d, invoice_template: tpl.id as any }))}
                          className={`relative rounded-xl border-2 p-2 text-left transition-all focus:outline-none ${
                            selected
                              ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700/30'
                          }`}
                        >
                          <TemplateMiniPreview
                            template={tpl.id}
                            color={invoiceDraft.invoice_primary_color ?? '#0F4C9A'}
                          />
                          <div className="mt-2 text-center">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{tpl.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{tpl.desc}</p>
                          </div>
                          {selected && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm">
                              <Check size={11} className="text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label htmlFor="inv-primary-color-text" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Couleur primaire</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label="Couleur primaire (sélecteur)"
                      value={invoiceDraft.invoice_primary_color ?? '#0F4C9A'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_primary_color: e.target.value }))}
                      className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      id="inv-primary-color-text"
                      value={invoiceDraft.invoice_primary_color ?? '#0F4C9A'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_primary_color: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="inv-secondary-color-text" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Couleur secondaire</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label="Couleur secondaire (sélecteur)"
                      value={invoiceDraft.invoice_secondary_color ?? '#21A8F6'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_secondary_color: e.target.value }))}
                      className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      id="inv-secondary-color-text"
                      value={invoiceDraft.invoice_secondary_color ?? '#21A8F6'}
                      onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_secondary_color: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="inv-offer-validity" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Validite devis (jours)</label>
                  <input
                    id="inv-offer-validity"
                    type="number"
                    min={1}
                    max={365}
                    value={invoiceDraft.offer_validity_days ?? 15}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, offer_validity_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label htmlFor="inv-bank-details" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Coordonnees bancaires</label>
                  <input
                    id="inv-bank-details"
                    value={invoiceDraft.bank_details ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, bank_details: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="inv-terms" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Conditions</label>
                  <textarea
                    id="inv-terms"
                    value={invoiceDraft.invoice_terms ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_terms: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-h-24 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="inv-footer" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pied de page</label>
                  <textarea
                    id="inv-footer"
                    value={invoiceDraft.invoice_footer ?? ''}
                    onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoice_footer: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-h-20 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
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

      {/* ============================================================= */}
      {/* Push Notifications — always visible (personal preference)      */}
      {/* ============================================================= */}
      <PushNotificationCard />
    </div>
  );
}


// ---- Push notification toggle card ----------------------------------------

function PushNotificationCard() {
  const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      const ok = await unsubscribe();
      if (ok) toast.success('Notifications push desactivees.');
    } else {
      const ok = await subscribe();
      if (ok) toast.success('Notifications push activees !');
      else if (permission === 'denied') toast.error('Notifications bloquees par le navigateur. Verifiez les parametres du site.');
    }
  };

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3 mb-3">
        <BellRing size={20} className="text-primary" />
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications push</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Recevez des alertes en temps reel sur votre appareil
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {isSubscribed ? 'Activees' : permission === 'denied' ? 'Bloquees par le navigateur' : 'Desactivees'}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || permission === 'denied'}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 ${
            isSubscribed ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isSubscribed ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

