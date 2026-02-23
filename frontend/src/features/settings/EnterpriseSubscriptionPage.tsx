/** Admin page to manage enterprise subscription contracts. */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { enterpriseApi, enterpriseSubscriptionApi } from '@/api/endpoints';
import type {
  Enterprise,
  EnterpriseSubscription,
  EnterpriseSubscriptionBillingCycle,
  EnterpriseSubscriptionPayload,
  EnterpriseSubscriptionStatus,
} from '@/api/types';
import { useAuthStore } from '@/auth/auth-store';
import { formatCurrency } from '@/lib/currency';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100';

const STATUS_OPTIONS: Array<{ value: EnterpriseSubscriptionStatus; label: string }> = [
  { value: 'TRIAL', label: 'Essai' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'PAST_DUE', label: 'Impayee' },
  { value: 'CANCELED', label: 'Resilie' },
  { value: 'EXPIRED', label: 'Expire' },
];

const STATUS_LABELS: Record<EnterpriseSubscriptionStatus, string> = {
  TRIAL: 'Essai',
  ACTIVE: 'Actif',
  PAST_DUE: 'Impayee',
  CANCELED: 'Resilie',
  EXPIRED: 'Expire',
};

const STATUS_BADGE_CLASSES: Record<EnterpriseSubscriptionStatus, string> = {
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  PAST_DUE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  CANCELED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  EXPIRED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const CYCLE_OPTIONS: Array<{ value: EnterpriseSubscriptionBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'Mensuel' },
  { value: 'QUARTERLY', label: 'Trimestriel' },
  { value: 'YEARLY', label: 'Annuel' },
  { value: 'CUSTOM', label: 'Personnalise' },
];

type FormState = {
  enterprise: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: EnterpriseSubscriptionBillingCycle;
  amount: string;
  currency: string;
  starts_on: string;
  ends_on: string;
  status: EnterpriseSubscriptionStatus;
  auto_renew: boolean;
  external_subscription_id: string;
  metadata_text: string;
};

function defaultForm(enterpriseId: string): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    enterprise: enterpriseId,
    plan_code: 'STANDARD',
    plan_name: 'Plan Standard',
    billing_cycle: 'MONTHLY',
    amount: '0.00',
    currency: 'FCFA',
    starts_on: today,
    ends_on: '',
    status: 'ACTIVE',
    auto_renew: true,
    external_subscription_id: '',
    metadata_text: '{}',
  };
}

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> | string } })?.response?.data;
  if (data && typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail;
    const first = Object.entries(data)[0];
    if (first) {
      const [field, value] = first;
      if (Array.isArray(value)) return `${field}: ${value.join(', ')}`;
      if (typeof value === 'string') return `${field}: ${value}`;
    }
  }
  return 'Une erreur est survenue.';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Illimite';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  } catch {
    return dateStr;
  }
}

function mapSubscriptionToForm(sub: EnterpriseSubscription): FormState {
  const metadata =
    sub.metadata && Object.keys(sub.metadata).length > 0
      ? JSON.stringify(sub.metadata, null, 2)
      : '{}';
  return {
    enterprise: sub.enterprise,
    plan_code: sub.plan_code,
    plan_name: sub.plan_name,
    billing_cycle: sub.billing_cycle,
    amount: sub.amount,
    currency: sub.currency,
    starts_on: sub.starts_on,
    ends_on: sub.ends_on ?? '',
    status: sub.status,
    auto_renew: sub.auto_renew,
    external_subscription_id: sub.external_subscription_id ?? '',
    metadata_text: metadata,
  };
}

export default function EnterpriseSubscriptionPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSuperuser = Boolean(user?.is_superuser);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');

  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const enterprisesQ = useQuery({
    queryKey: queryKeys.enterprises.all,
    queryFn: () => enterpriseApi.list({ page_size: '200', ordering: 'name' }),
  });

  const enterprises: Enterprise[] = enterprisesQ.data?.results ?? [];
  const defaultEnterpriseId = isSuperuser ? '' : (enterprises[0]?.id ?? '');

  const [form, setForm] = useState<FormState>(() => defaultForm(defaultEnterpriseId));

  useEffect(() => {
    if (!isSuperuser && enterprises.length > 0) {
      setForm((prev) => {
        if (prev.enterprise) return prev;
        return { ...prev, enterprise: enterprises[0].id };
      });
    }
  }, [isSuperuser, enterprises]);

  const listParams = useMemo(() => {
    const params: Record<string, string> = {
      page_size: '200',
      ordering: '-starts_on',
    };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    if (cycleFilter) params.billing_cycle = cycleFilter;
    return params;
  }, [search, statusFilter, cycleFilter]);

  const subscriptionsQ = useQuery({
    queryKey: queryKeys.enterpriseSubscriptions.list(listParams),
    queryFn: () => enterpriseSubscriptionApi.list(listParams),
  });

  const subscriptions = subscriptionsQ.data?.results ?? [];

  const saveMutation = useMutation({
    mutationFn: (args: { id?: string; payload: EnterpriseSubscriptionPayload }) => {
      if (args.id) return enterpriseSubscriptionApi.update(args.id, args.payload);
      return enterpriseSubscriptionApi.create(args.payload);
    },
    onSuccess: (saved, args) => {
      toast.success(
        args.id
          ? `Abonnement mis a jour: ${saved.plan_name}`
          : `Abonnement cree: ${saved.plan_name}`,
      );
      setFormError('');
      setEditingSubscriptionId(saved.id);
      setForm(mapSubscriptionToForm(saved));
      void queryClient.invalidateQueries({ queryKey: queryKeys.enterpriseSubscriptions.all });
    },
    onError: (err: unknown) => {
      const msg = extractError(err);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => enterpriseSubscriptionApi.delete(id),
    onSuccess: (_res, id) => {
      toast.warning('Abonnement supprime.');
      if (editingSubscriptionId === id) {
        setEditingSubscriptionId(null);
        setForm(defaultForm(defaultEnterpriseId));
        setFormError('');
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.enterpriseSubscriptions.all });
    },
    onError: (err: unknown) => {
      toast.error(extractError(err));
    },
  });

  function handleResetForm() {
    setEditingSubscriptionId(null);
    setForm(defaultForm(defaultEnterpriseId));
    setFormError('');
  }

  function handleEdit(subscription: EnterpriseSubscription) {
    setEditingSubscriptionId(subscription.id);
    setForm(mapSubscriptionToForm(subscription));
    setFormError('');
  }

  function handleDelete(subscription: EnterpriseSubscription) {
    const ok = window.confirm(
      `Supprimer l'abonnement "${subscription.plan_name}" ? Cette action est irreversible.`,
    );
    if (!ok) return;
    deleteMutation.mutate(subscription.id);
  }

  function handleSave() {
    if (!form.plan_code.trim() || !form.plan_name.trim()) {
      setFormError('Le code plan et le nom plan sont requis.');
      return;
    }
    if (!form.starts_on) {
      setFormError('La date de debut est requise.');
      return;
    }
    if (isSuperuser && !form.enterprise) {
      setFormError("Selectionnez une entreprise.");
      return;
    }

    const metadataRaw = form.metadata_text.trim();
    let metadata: Record<string, unknown> | undefined;
    if (metadataRaw) {
      try {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setFormError('metadata doit etre un objet JSON (ex: {"source":"manual"}).');
          return;
        }
        metadata = parsed as Record<string, unknown>;
      } catch {
        setFormError('metadata JSON invalide.');
        return;
      }
    }

    const payload: EnterpriseSubscriptionPayload = {
      ...(form.enterprise ? { enterprise: form.enterprise } : {}),
      plan_code: form.plan_code.trim(),
      plan_name: form.plan_name.trim(),
      billing_cycle: form.billing_cycle,
      amount: form.amount.trim() || '0.00',
      currency: form.currency.trim() || 'FCFA',
      starts_on: form.starts_on,
      ends_on: form.ends_on || null,
      status: form.status,
      auto_renew: form.auto_renew,
      external_subscription_id: form.external_subscription_id.trim() || undefined,
      metadata,
    };

    setFormError('');
    saveMutation.mutate({
      id: editingSubscriptionId ?? undefined,
      payload,
    });
  }

  function enterpriseName(enterpriseId: string): string {
    return enterprises.find((ent) => ent.id === enterpriseId)?.name ?? enterpriseId;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CircleDollarSign size={24} className="text-primary" />
            Abonnements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gerez les contrats d'abonnement des entreprises.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            enterprisesQ.refetch();
            subscriptionsQ.refetch();
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher plan, entreprise..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Tous les statuts</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Tous les cycles</option>
            {CYCLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          {subscriptionsQ.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : subscriptionsQ.isError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {extractError(subscriptionsQ.error)}
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-500 dark:text-gray-400">
              Aucun abonnement.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Entreprise</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Periode</th>
                    <th className="px-4 py-3 font-medium text-right">Montant</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr
                      key={sub.id}
                      className={`border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        editingSubscriptionId === sub.id ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleEdit(sub)}
                          className="text-left w-full"
                        >
                          <div className="font-medium text-gray-900 dark:text-gray-100">{sub.plan_name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {sub.plan_code}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-700 dark:text-gray-300">
                        {enterpriseName(sub.enterprise)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_BADGE_CLASSES[sub.status]
                          }`}
                        >
                          {STATUS_LABELS[sub.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-700 dark:text-gray-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-gray-400" />
                          <span>{`${formatDate(sub.starts_on)} -> ${formatDate(sub.ends_on)}`}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800 dark:text-gray-200">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(sub)}
                            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(sub)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
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

        <div className="xl:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4 sticky top-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {editingSubscriptionId ? 'Modifier abonnement' : 'Nouveau abonnement'}
              </h2>
              <button
                type="button"
                onClick={handleResetForm}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Plus size={14} />
                Nouveau
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                {formError}
              </div>
            )}

            {isSuperuser && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Entreprise
                </label>
                <select
                  value={form.enterprise}
                  onChange={(e) => setForm((prev) => ({ ...prev, enterprise: e.target.value }))}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Code plan
                </label>
                <input
                  value={form.plan_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, plan_code: e.target.value }))}
                  className={inputClass}
                  placeholder="STANDARD"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Nom plan
                </label>
                <input
                  value={form.plan_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, plan_name: e.target.value }))}
                  className={inputClass}
                  placeholder="Plan Standard"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Cycle
                </label>
                <select
                  value={form.billing_cycle}
                  onChange={(e) => setForm((prev) => ({ ...prev, billing_cycle: e.target.value as EnterpriseSubscriptionBillingCycle }))}
                  className={inputClass}
                >
                  {CYCLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Statut
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as EnterpriseSubscriptionStatus }))}
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Montant
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Devise
                </label>
                <input
                  value={form.currency}
                  onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                  className={inputClass}
                  placeholder="FCFA"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Debut
                </label>
                <input
                  type="date"
                  value={form.starts_on}
                  onChange={(e) => setForm((prev) => ({ ...prev, starts_on: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Fin
                </label>
                <input
                  type="date"
                  value={form.ends_on}
                  onChange={(e) => setForm((prev) => ({ ...prev, ends_on: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                ID externe
              </label>
              <input
                value={form.external_subscription_id}
                onChange={(e) => setForm((prev) => ({ ...prev, external_subscription_id: e.target.value }))}
                className={inputClass}
                placeholder="sub_xxx..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Metadata (JSON objet)
              </label>
              <textarea
                value={form.metadata_text}
                onChange={(e) => setForm((prev) => ({ ...prev, metadata_text: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-h-24 font-mono dark:bg-gray-700 dark:text-gray-100"
                placeholder='{"source":"manual"}'
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.auto_renew}
                onChange={(e) => setForm((prev) => ({ ...prev, auto_renew: e.target.checked }))}
              />
              Renouvellement automatique
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Pencil size={16} />
                    Enregistrer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
