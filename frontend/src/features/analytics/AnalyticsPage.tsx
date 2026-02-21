/** Advanced analytics/AI page (Manager/Admin). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { BarChart3, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';

import { analyticsApi } from '@/api/endpoints';
import CurrencyDisplay from '@/components/shared/CurrencyDisplay';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';

function errDetail(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string }>;
  return ax?.response?.data?.detail ?? (err as Error)?.message ?? 'Erreur.';
}

type Tab = 'dashboard' | 'abc' | 'reorder' | 'credit' | 'forecast' | 'fraud';

type FeatureFlags = Record<string, boolean | undefined>;

type DateParams = { store: string; date_from: string; date_to: string };
type AsOfParams = { store: string; as_of: string };
type ForecastParams = { store: string; horizon_days: string };
type FraudParams = { store: string; date_from: string; date_to: string; status?: 'open' | 'resolved' };

type StrategicKpis = {
  feature_flags: FeatureFlags;
  date_from: string;
  date_to: string;
  revenue: string;
  revenue_growth_pct: string;
  orders: number;
  avg_basket: string;
  net_sales: string;
  stockout_count: number;
  active_sales_count: number;
  forecast_next_7d_qty: string;
  abc_distribution: Record<string, { revenue: string; products: number }>;
  reorder: { total: number; high: number; medium: number };
  credit: { scored_accounts: number; average_score: number; grade_breakdown: Record<string, number> };
  fraud: { events: number; critical: number; unresolved: number };
};

type ABCRow = {
  id: string;
  product_name: string;
  product_sku: string;
  quantity_sold: string | number;
  revenue: string;
  revenue_share: string;
  cumulative_share: string;
  abc_class: string;
};

type ReorderRow = {
  id: string;
  product_name: string;
  product_sku: string;
  avg_daily_sales: string;
  reorder_point: string;
  current_available: string;
  suggested_order_qty: string;
  days_of_cover: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | string;
};

type CreditScoreRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  score: number;
  grade: string;
  utilization_rate: string;
  payment_ratio: string;
  overdue_ratio: string;
  overdue_amount: string;
  balance: string;
  recommended_limit: string;
};

type ForecastRow = {
  id: string;
  product_name: string;
  product_sku: string;
  forecast_date: string;
  predicted_qty: string;
  confidence: string;
};

type FraudRow = {
  id: string;
  detected_on: string;
  rule_code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  risk_score: number;
  title: string;
  description: string;
  sale_invoice: string | null;
  is_resolved: boolean;
  created_at: string;
};

function toISODateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, delta: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function fmtPct01(value: unknown): string {
  const n = toNum(value, 0);
  const pct = n * 100;
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%`;
}

function fmtPct(value: unknown): string {
  const n = toNum(value, 0);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%`;
}

function FraudSeverityBadge({ value }: { value: string }) {
  const variant =
    value === 'CRITICAL'
      ? 'bg-red-100 text-red-800'
      : value === 'WARNING'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-blue-100 text-blue-800';
  const label = value === 'CRITICAL' ? 'Critique' : value === 'WARNING' ? 'Warning' : 'Info';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variant}`}>{label}</span>;
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const store = useStoreStore((s) => s.currentStore);
  const storeId = store?.id ?? '';

  const [tab, setTab] = useState<Tab>('dashboard');
  const [fraudStatus, setFraudStatus] = useState<'all' | 'open' | 'resolved'>('all');
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = new Date();
    return toISODateLocal(addDays(today, -29));
  });
  const [dateTo, setDateTo] = useState<string>(() => toISODateLocal(new Date()));

  const params = useMemo<DateParams>(() => ({ store: storeId, date_from: dateFrom, date_to: dateTo }), [storeId, dateFrom, dateTo]);
  const asOfParams = useMemo<AsOfParams>(() => ({ store: storeId, as_of: dateTo }), [storeId, dateTo]);
  const forecastParams = useMemo<ForecastParams>(() => ({ store: storeId, horizon_days: '14' }), [storeId]);
  const fraudParams = useMemo<FraudParams>(() => {
    const base: FraudParams = { store: storeId, date_from: dateFrom, date_to: dateTo };
    if (fraudStatus !== 'all') base.status = fraudStatus;
    return base;
  }, [storeId, dateFrom, dateTo, fraudStatus]);

  const strategicQ = useQuery<StrategicKpis>({
    queryKey: queryKeys.analytics.strategic(params),
    queryFn: () => analyticsApi.strategicKpis(params),
    enabled: !!storeId,
  });

  const abcQ = useQuery<ABCRow[]>({
    queryKey: queryKeys.analytics.abc(params),
    queryFn: () => analyticsApi.abc(params),
    enabled: !!storeId && tab === 'abc',
  });

  const reorderQ = useQuery<ReorderRow[]>({
    queryKey: queryKeys.analytics.reorder(asOfParams),
    queryFn: () => analyticsApi.reorder(asOfParams),
    enabled: !!storeId && tab === 'reorder',
  });

  const creditQ = useQuery<CreditScoreRow[]>({
    queryKey: queryKeys.analytics.credit(asOfParams),
    queryFn: () => analyticsApi.creditScores(asOfParams),
    enabled: !!storeId && tab === 'credit',
  });

  const forecastQ = useQuery<ForecastRow[]>({
    queryKey: queryKeys.analytics.forecast(forecastParams),
    queryFn: () => analyticsApi.forecast(forecastParams),
    enabled: !!storeId && tab === 'forecast',
  });

  const fraudQ = useQuery<FraudRow[]>({
    queryKey: queryKeys.analytics.fraud(fraudParams),
    queryFn: () => analyticsApi.fraudEvents(fraudParams),
    enabled: !!storeId && tab === 'fraud',
  });

  const recalcMut = useMutation({
    mutationFn: () => analyticsApi.strategicKpis({ ...params, refresh: '1' }),
    onSuccess: () => {
      toast.info(`Indicateurs recalcules (${dateFrom} -> ${dateTo}).`);
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  const anyError =
    (strategicQ.isError ? errDetail(strategicQ.error) : null) ??
    (abcQ.isError ? errDetail(abcQ.error) : null) ??
    (reorderQ.isError ? errDetail(reorderQ.error) : null) ??
    (creditQ.isError ? errDetail(creditQ.error) : null) ??
    (forecastQ.isError ? errDetail(forecastQ.error) : null) ??
    (fraudQ.isError ? errDetail(fraudQ.error) : null);

  const forecastAgg = useMemo(() => {
    const byDate = new Map<string, number>();
    const byProduct = new Map<string, { name: string; sku: string; qty: number }>();

    for (const r of forecastQ.data ?? []) {
      const qty = toNum(r.predicted_qty, 0);
      byDate.set(r.forecast_date, (byDate.get(r.forecast_date) ?? 0) + qty);

      const key = `${r.product_sku}::${r.product_name}`;
      const prev = byProduct.get(key);
      byProduct.set(key, {
        name: r.product_name,
        sku: r.product_sku,
        qty: (prev?.qty ?? 0) + qty,
      });
    }

    const dates = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const topProducts = Array.from(byProduct.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

    return { dates, topProducts };
  }, [forecastQ.data]);

  if (!storeId) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucun magasin selectionne.</div>;
  }

  const flags = strategicQ.data?.feature_flags ?? {};
  const tabEnabled: Record<Tab, boolean> = {
    dashboard: !!flags.dashboard_strategic || strategicQ.isLoading || strategicQ.isError,
    abc: !!flags.abc_analysis || strategicQ.isLoading || strategicQ.isError,
    reorder: !!flags.dynamic_reorder || strategicQ.isLoading || strategicQ.isError,
    credit: !!flags.credit_scoring || strategicQ.isLoading || strategicQ.isError,
    forecast: !!flags.sales_forecast || strategicQ.isLoading || strategicQ.isError,
    fraud: !!flags.fraud_detection || strategicQ.isLoading || strategicQ.isError,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 size={22} /> Analytics / AI
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Magasin: {store?.name}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">Periode</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100"
            />
            <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100"
            />
          </div>

          <button
            type="button"
            onClick={() => recalcMut.mutate()}
            disabled={recalcMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Recalcule les indicateurs"
          >
            <RefreshCw size={16} className={recalcMut.isPending ? 'animate-spin' : ''} />
            Recalculer
          </button>

          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm dark:text-gray-300"
          >
            Actualiser
          </button>
        </div>
      </div>

      {anyError && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-700 mt-0.5" />
          <div className="text-sm text-amber-900">{anyError}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ['dashboard', 'Dashboard'],
          ['abc', 'ABC'],
          ['reorder', 'Reorder'],
          ['credit', 'Credit score'],
          ['forecast', 'Forecast'],
          ['fraud', 'Fraud'],
        ] as Array<[Tab, string]>).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => tabEnabled[k] && setTab(k)}
            disabled={!tabEnabled[k]}
            title={!tabEnabled[k] ? 'Fonctionnalite desactivee (feature flags)' : undefined}
            className={`px-3 py-2 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              tab === k ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div className="space-y-4">
          {strategicQ.isLoading ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : !strategicQ.data ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              Aucune donnee. Cliquez sur Recalculer.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Chiffre d'affaires</div>
                  <div className="text-xl font-semibold mt-1">
                    <CurrencyDisplay value={strategicQ.data.revenue} />
                  </div>
                  <div className={`text-xs mt-1 ${toNum(strategicQ.data.revenue_growth_pct) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmtPct(strategicQ.data.revenue_growth_pct)} vs periode precedente
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Commandes</div>
                  <div className="text-xl font-semibold mt-1">{strategicQ.data.orders}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ventes actives: {strategicQ.data.active_sales_count}</div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Panier moyen</div>
                  <div className="text-xl font-semibold mt-1">
                    <CurrencyDisplay value={strategicQ.data.avg_basket} />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Net: <CurrencyDisplay value={strategicQ.data.net_sales} />
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Prevision (7j)</div>
                  <div className="text-xl font-semibold mt-1">{toNum(strategicQ.data.forecast_next_7d_qty).toLocaleString('fr-FR')}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ruptures: {strategicQ.data.stockout_count}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">ABC</div>
                  {Object.keys(strategicQ.data.abc_distribution ?? {}).length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Aucune analyse ABC. Cliquez Recalculer.</div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {Object.entries(strategicQ.data.abc_distribution).map(([cls, v]) => (
                        <div key={cls} className="flex items-center justify-between">
                          <div className="font-medium">Classe {cls}</div>
                          <div className="text-gray-600 dark:text-gray-400">
                            <CurrencyDisplay value={v.revenue} /> ({v.products} produits)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Reassort</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Total: <span className="font-medium">{strategicQ.data.reorder.total}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Urgent: <span className="font-medium">{strategicQ.data.reorder.high}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Moyen: <span className="font-medium">{strategicQ.data.reorder.medium}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Ouvrez l'onglet Reorder pour la liste detaillee.</div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Risque</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Credit (comptes notes): <span className="font-medium">{strategicQ.data.credit.scored_accounts}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Score moyen: <span className="font-medium">{strategicQ.data.credit.average_score}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Fraude (evenements): <span className="font-medium">{strategicQ.data.fraud.events}</span> (non resolus: {strategicQ.data.fraud.unresolved})
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Cliquez Recalculer si c'est vide.</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'abc' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 overflow-auto">
          {abcQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : (abcQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune donnee. Cliquez Recalculer, puis revenez ici.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400">
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 pr-4">Classe</th>
                  <th className="text-left py-2 pr-4">Produit</th>
                  <th className="text-left py-2 pr-4">SKU</th>
                  <th className="text-right py-2 pr-4">Qte</th>
                  <th className="text-right py-2 pr-4">CA</th>
                  <th className="text-right py-2 pr-4">Part</th>
                  <th className="text-right py-2">Cumul</th>
                </tr>
              </thead>
              <tbody>
                {abcQ.data?.map((row) => (
                  <tr key={row.id} className="border-b dark:border-gray-700 last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{row.abc_class}</td>
                    <td className="py-2 pr-4">{row.product_name}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{row.product_sku}</td>
                    <td className="py-2 pr-4 text-right">{toNum(row.quantity_sold).toLocaleString('fr-FR')}</td>
                    <td className="py-2 pr-4 text-right">
                      <CurrencyDisplay value={row.revenue} />
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtPct01(row.revenue_share)}</td>
                    <td className="py-2 text-right">{fmtPct01(row.cumulative_share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reorder' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 overflow-auto">
          {reorderQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : (reorderQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune recommandation. Cliquez Recalculer pour generer.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400">
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 pr-4">Produit</th>
                  <th className="text-left py-2 pr-4">SKU</th>
                  <th className="text-right py-2 pr-4">Disponible</th>
                  <th className="text-right py-2 pr-4">Point</th>
                  <th className="text-right py-2 pr-4">Commander</th>
                  <th className="text-right py-2 pr-4">Couverture</th>
                  <th className="text-left py-2">Urgence</th>
                </tr>
              </thead>
              <tbody>
                {reorderQ.data?.map((row) => (
                  <tr key={row.id} className="border-b dark:border-gray-700 last:border-b-0">
                    <td className="py-2 pr-4">{row.product_name}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{row.product_sku}</td>
                    <td className="py-2 pr-4 text-right">{toNum(row.current_available).toLocaleString('fr-FR')}</td>
                    <td className="py-2 pr-4 text-right">{toNum(row.reorder_point).toLocaleString('fr-FR')}</td>
                    <td className="py-2 pr-4 text-right font-medium">{toNum(row.suggested_order_qty).toLocaleString('fr-FR')}</td>
                    <td className="py-2 pr-4 text-right">{toNum(row.days_of_cover).toLocaleString('fr-FR')} j</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          row.urgency === 'HIGH'
                            ? 'bg-red-100 text-red-800'
                            : row.urgency === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {row.urgency === 'HIGH' ? 'Haute' : row.urgency === 'MEDIUM' ? 'Moyenne' : 'Basse'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'credit' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 overflow-auto">
          {creditQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : (creditQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune donnee. Cliquez Recalculer pour noter les comptes.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400">
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 pr-4">Client</th>
                  <th className="text-left py-2 pr-4">Telephone</th>
                  <th className="text-right py-2 pr-4">Score</th>
                  <th className="text-left py-2 pr-4">Grade</th>
                  <th className="text-right py-2 pr-4">Utilisation</th>
                  <th className="text-right py-2 pr-4">Retard</th>
                  <th className="text-right py-2">Solde</th>
                </tr>
              </thead>
              <tbody>
                {creditQ.data?.map((row) => (
                  <tr key={row.id} className="border-b dark:border-gray-700 last:border-b-0">
                    <td className="py-2 pr-4">{row.customer_name}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{row.customer_phone}</td>
                    <td className="py-2 pr-4 text-right font-medium">{row.score}</td>
                    <td className="py-2 pr-4">{row.grade}</td>
                    <td className="py-2 pr-4 text-right">{fmtPct01(row.utilization_rate)}</td>
                    <td className="py-2 pr-4 text-right">{fmtPct01(row.overdue_ratio)}</td>
                    <td className="py-2 text-right">
                      <CurrencyDisplay value={row.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'forecast' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {forecastQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
          ) : (forecastQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Aucune prevision. Cliquez Recalculer pour generer.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Demande prevue par jour</div>
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b dark:border-gray-700">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-right py-2">Qte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastAgg.dates.map(([d, qty]) => (
                      <tr key={d} className="border-b dark:border-gray-700 last:border-b-0">
                        <td className="py-2 pr-4">{d}</td>
                        <td className="py-2 text-right">{qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Top produits (horizon)</div>
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b dark:border-gray-700">
                      <th className="text-left py-2 pr-4">Produit</th>
                      <th className="text-left py-2 pr-4">SKU</th>
                      <th className="text-right py-2">Qte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastAgg.topProducts.map((p) => (
                      <tr key={`${p.sku}::${p.name}`} className="border-b dark:border-gray-700 last:border-b-0">
                        <td className="py-2 pr-4">{p.name}</td>
                        <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{p.sku}</td>
                        <td className="py-2 text-right">{p.qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'fraud' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">Statut</div>
            {(['all', 'open', 'resolved'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFraudStatus(k)}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  fraudStatus === k ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:text-gray-300'
                }`}
              >
                {k === 'all' ? 'Tous' : k === 'open' ? 'Ouverts' : 'Resolus'}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 overflow-auto">
            {fraudQ.isLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Chargement...</div>
            ) : (fraudQ.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Aucun evenement. Cliquez Recalculer pour lancer la detection (ou ajustez la periode).</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-xs text-gray-500 dark:text-gray-400">
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Severite</th>
                    <th className="text-right py-2 pr-4">Score</th>
                    <th className="text-left py-2 pr-4">Vente</th>
                    <th className="text-left py-2 pr-4">Titre</th>
                    <th className="text-left py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {fraudQ.data?.map((row) => (
                    <tr key={row.id} className="border-b dark:border-gray-700 last:border-b-0">
                      <td className="py-2 pr-4">{row.detected_on}</td>
                      <td className="py-2 pr-4">
                        <FraudSeverityBadge value={row.severity} />
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">{row.risk_score}</td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{row.sale_invoice ?? '-'}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{row.title}</div>
                        {row.description ? <div className="text-xs text-gray-500 dark:text-gray-400">{row.description}</div> : null}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            row.is_resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {row.is_resolved ? 'Resolue' : 'Ouverte'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

