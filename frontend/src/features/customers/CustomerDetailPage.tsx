/** Customer detail page - info, credit accounts, purchase history, customer intelligence. */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, customerApi, creditApi, saleApi } from '@/api/endpoints';
import type { CustomerRecommendationItem } from '@/api/types';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import StatusBadge from '@/components/shared/StatusBadge';
import { ChevronLeft, Pencil } from 'lucide-react';
import { useStoreStore } from '@/store-context/store-store';

function getCreditHealthColor(balance: string, limit: string, available: string): string {
  const bal = parseFloat(balance) || 0;
  const lim = parseFloat(limit) || 0;
  const avail = parseFloat(available) || 0;

  if (lim > 0 && bal > lim) return 'bg-red-500';
  if (lim > 0 && avail < lim * 0.2) return 'bg-orange-500';
  return 'bg-green-500';
}

function segmentLabel(value: string): string {
  if (value === 'VIP') return 'VIP';
  if (value === 'REGULAR') return 'Regulier';
  if (value === 'OCCASIONAL') return 'Occasionnel';
  if (value === 'DORMANT') return 'Dormant';
  if (value === 'RISK') return 'Risque';
  return value || '-';
}

function segmentTone(value: string): string {
  if (value === 'VIP') return 'bg-emerald-100 text-emerald-800';
  if (value === 'REGULAR') return 'bg-blue-100 text-blue-800';
  if (value === 'OCCASIONAL') return 'bg-amber-100 text-amber-800';
  if (value === 'DORMANT') return 'bg-gray-100 text-gray-700';
  if (value === 'RISK') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

function riskLabel(value: string): string {
  if (value === 'LOW') return 'Faible';
  if (value === 'MEDIUM') return 'Moyen';
  if (value === 'HIGH') return 'Eleve';
  if (value === 'CRITICAL') return 'Critique';
  return value || '-';
}

function riskTone(value: string): string {
  if (value === 'LOW') return 'bg-emerald-100 text-emerald-800';
  if (value === 'MEDIUM') return 'bg-amber-100 text-amber-800';
  if (value === 'HIGH') return 'bg-orange-100 text-orange-800';
  if (value === 'CRITICAL') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

function probabilityLabel(value: string): string {
  if (value === 'HIGH') return 'Haute';
  if (value === 'MEDIUM') return 'Moyenne';
  if (value === 'LOW') return 'Faible';
  return value || '-';
}

function sourceLabel(source: CustomerRecommendationItem['source']): string {
  if (source === 'FREQUENTLY_BOUGHT_TOGETHER') return 'Cross-sell';
  if (source === 'NEXT_BEST_CATEGORY') return 'Categorie';
  if (source === 'REFILL_RENEWAL') return 'Renouvellement';
  return source || 'Mixte';
}

function sourceTone(source: CustomerRecommendationItem['source']): string {
  if (source === 'FREQUENTLY_BOUGHT_TOGETHER') return 'bg-indigo-100 text-indigo-800';
  if (source === 'NEXT_BEST_CATEGORY') return 'bg-cyan-100 text-cyan-800';
  if (source === 'REFILL_RENEWAL') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';

  const scoreParams = useMemo(() => ({ store: storeId }), [storeId]);
  const recommendationParams = useMemo(
    () => ({
      store: storeId,
      window_days: '90',
      limit: '5',
      include_only_in_stock: '1' as const,
    }),
    [storeId],
  );

  const {
    data: customer,
    isLoading: customerLoading,
    isError: customerError,
  } = useQuery({
    queryKey: queryKeys.customers.detail(id!),
    queryFn: () => customerApi.get(id!),
    enabled: !!id,
  });

  const { data: creditData } = useQuery({
    queryKey: queryKeys.creditAccounts.list({ customer: id! }),
    queryFn: () => creditApi.accounts({ customer: id! }),
    enabled: !!id,
  });

  const { data: salesData } = useQuery({
    queryKey: queryKeys.sales.list({ customer: id!, ordering: '-created_at', page_size: '10' }),
    queryFn: () => saleApi.list({ customer: id!, ordering: '-created_at', page_size: '10' }),
    enabled: !!id,
  });

  const scoreQ = useQuery({
    queryKey: queryKeys.analytics.customerScore(id ?? '', scoreParams),
    queryFn: () => analyticsApi.customerScore(id!, scoreParams),
    enabled: Boolean(id && storeId),
  });

  const creditRiskQ = useQuery({
    queryKey: queryKeys.analytics.customerCreditRiskForCustomer(id ?? '', scoreParams),
    queryFn: () => analyticsApi.customerCreditRiskForCustomer(id!, scoreParams),
    enabled: Boolean(id && storeId),
  });

  const nextOrderQ = useQuery({
    queryKey: queryKeys.analytics.customerNextOrder(id ?? '', scoreParams),
    queryFn: () => analyticsApi.customerNextOrder(id!, scoreParams),
    enabled: Boolean(id && storeId),
  });

  const recommendationsQ = useQuery({
    queryKey: queryKeys.analytics.customerRecommendations(id ?? '', recommendationParams),
    queryFn: () => analyticsApi.customerRecommendations(id!, recommendationParams),
    enabled: Boolean(id && storeId),
  });

  const creditAccounts = creditData?.results ?? [];
  const sales = salesData?.results ?? [];
  const recommendations = recommendationsQ.data?.items ?? [];
  const intelLoading =
    scoreQ.isLoading ||
    creditRiskQ.isLoading ||
    nextOrderQ.isLoading ||
    recommendationsQ.isLoading;
  const intelError =
    scoreQ.isError ||
    creditRiskQ.isError ||
    nextOrderQ.isError ||
    recommendationsQ.isError;

  if (customerLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (customerError || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-500">Client introuvable ou une erreur s'est produite.</p>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <ChevronLeft size={16} />
          Retour aux clients
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
      >
        <ChevronLeft size={16} />
        Retour
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{customer.full_name}</h1>
        <Link
          to={`/customers/${id}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Pencil size={16} />
          Modifier
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Informations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Telephone</span>
            <p className="font-medium mt-0.5">{customer.phone || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">E-mail</span>
            <p className="font-medium mt-0.5">{customer.email || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Adresse</span>
            <p className="font-medium mt-0.5">{customer.address || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Structure</span>
            <p className="font-medium mt-0.5">{customer.company || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Ajoute par</span>
            <p className="font-medium mt-0.5">{customer.created_by_name || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Date d'ajout</span>
            <p className="font-medium mt-0.5">
              {customer.created_at
                ? new Date(customer.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-5">
          Intelligence client
        </h2>

        {!storeId ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Selectionnez un magasin actif pour charger le score, le risque credit, la prediction et les recommandations.
          </p>
        ) : intelLoading ? (
          <div className="flex items-center gap-2.5 text-sm text-gray-400 dark:text-gray-500 py-2">
            <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-600 border-t-gray-500 animate-spin flex-shrink-0" />
            Chargement des analyses...
          </div>
        ) : (
          <div className="space-y-5">
            {intelError && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
                Une partie des analyses client n'a pas pu etre chargee.
              </div>
            )}

            {/* ── Métriques primaires ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-5">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Score client</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white leading-none">
                    {scoreQ.data?.score_total ?? '—'}
                  </span>
                  <span className="text-sm text-gray-400 dark:text-gray-500">/100</span>
                </div>
                {scoreQ.data?.segment ? (
                  <span className={`mt-3 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${segmentTone(scoreQ.data.segment)}`}>
                    {segmentLabel(scoreQ.data.segment)}
                  </span>
                ) : null}
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-5">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Risque credit</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white leading-none">
                    {creditRiskQ.data?.credit_risk_score ?? '—'}
                  </span>
                  <span className="text-sm text-gray-400 dark:text-gray-500">/100</span>
                </div>
                {creditRiskQ.data?.risk_level ? (
                  <span className={`mt-3 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${riskTone(creditRiskQ.data.risk_level)}`}>
                    {riskLabel(creditRiskQ.data.risk_level)}
                  </span>
                ) : null}
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-5">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Prochaine commande</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
                  {fmtDate(nextOrderQ.data?.predicted_next_purchase_date)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    nextOrderQ.data?.probability === 'HIGH' ? 'bg-emerald-500' :
                    nextOrderQ.data?.probability === 'MEDIUM' ? 'bg-amber-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Probabilite {probabilityLabel(nextOrderQ.data?.probability ?? '')}
                    {nextOrderQ.data?.days_until_prediction != null ? ` · J+${nextOrderQ.data.days_until_prediction}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Recommandation crédit — bannière ── */}
            {creditRiskQ.data?.recommendation && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Recommandation credit</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{creditRiskQ.data.recommendation.label}</p>
                </div>
                <div className="flex items-center gap-8 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Acompte min.</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {creditRiskQ.data.recommendation.recommended_deposit_percent}
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">%</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Plafond recommande</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(creditRiskQ.data.recommendation.recommended_limit ?? '0')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Recommandations produits ── */}
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Recommandations produits</p>
              {recommendations.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aucune recommandation disponible pour ce client.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recommendations.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-4 py-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: item.score >= 80 ? '#10b981' : item.score >= 60 ? '#3b82f6' : '#f59e0b' }}
                      >
                        {item.score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {item.sku}{item.reasons[0] ? ` · ${item.reasons[0]}` : ''}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${sourceTone(item.source)}`}>
                        {sourceLabel(item.source)}
                      </span>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.selling_price)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Stock: {item.available_stock ?? '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {creditAccounts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Comptes de credit
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-left">
                  <th className="pb-2 font-medium">Limite</th>
                  <th className="pb-2 font-medium text-right">Solde</th>
                  <th className="pb-2 font-medium text-right">Disponible</th>
                  <th className="pb-2 font-medium text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {creditAccounts.map((account) => {
                  const healthColor = getCreditHealthColor(
                    account.balance,
                    account.credit_limit,
                    account.available_credit,
                  );
                  return (
                    <tr key={account.id} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-3 font-medium">{formatCurrency(account.credit_limit)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(account.balance)}</td>
                      <td className="py-3 text-right">{formatCurrency(account.available_credit)}</td>
                      <td className="py-3 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${healthColor}`} />
                          <span className="text-gray-600 dark:text-gray-400">
                            {account.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Historique des achats
        </h2>
        {sales.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Aucun achat enregistre.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-left">
                  <th className="pb-2 font-medium">Facture</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-3 font-medium">{sale.invoice_number ?? '-'}</td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      {new Date(sale.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-right font-medium">{formatCurrency(sale.total)}</td>
                    <td className="py-3 text-center">
                      <StatusBadge type="sale" value={sale.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
