import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { expenseApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';

function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function toNumber(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ExpenseDashboardPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [period, setPeriod] = useState(currentPeriod());

  const params = useMemo(
    () => (currentStore ? { store: currentStore.id, period } : null),
    [currentStore, period],
  );

  const { data, isLoading } = useQuery({
    queryKey: currentStore ? queryKeys.expenses.dashboard(currentStore.id, period) : ['expenses', 'dashboard'],
    queryFn: () => expenseApi.dashboard(params!),
    enabled: !!params,
  });

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard depenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boutique: {currentStore.name}</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Periode</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">Depenses total</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(data.total_expenses)}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">Mois precedent</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(data.previous_total_expenses)}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">Variation</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(data.comparison.delta)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {data.comparison.growth_percent ? `${toNumber(data.comparison.growth_percent).toFixed(2)}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">CA periode</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(data.revenue_total)}</div>
            </div>
            <div className={`rounded-xl border p-4 ${data.expense_ratio_alert_red ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
              <div className="text-sm text-gray-500 dark:text-gray-400">Ratio depenses / CA</div>
              <div className={`text-xl font-bold mt-1 ${data.expense_ratio_alert_red ? 'text-red-700' : ''}`}>
                {toNumber(data.expense_ratio_percent).toFixed(2)}%
              </div>
              {data.expense_ratio_alert_red && (
                <div className="text-xs text-red-600 mt-1">Alerte: ratio superieur a 40%</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Top 5 categories</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400">Categorie</th>
                    <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_5_categories.length > 0 ? (
                    data.top_5_categories.map((row) => (
                      <tr key={`${row.category_id}-${row.category__name}`} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2">{row.category__name || 'Sans categorie'}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-4 text-gray-500" colSpan={2}>Aucune donnee.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Total par wallet</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400">Wallet</th>
                    <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400">Type</th>
                    <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_wallet.length > 0 ? (
                    data.by_wallet.map((row) => (
                      <tr key={`${row.wallet_id}-${row.wallet__name}`} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2">{row.wallet__name}</td>
                        <td className="px-4 py-2">{row.wallet__type}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-4 text-gray-500" colSpan={3}>Aucune donnee.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Suivi des budgets ({data.period})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400">Categorie</th>
                  <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Budget</th>
                  <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Depense</th>
                  <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Reste</th>
                  <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400">Conso %</th>
                  <th className="text-center px-4 py-2 text-gray-600 dark:text-gray-400">Alerte</th>
                </tr>
              </thead>
              <tbody>
                {data.budgets.length > 0 ? (
                  data.budgets.map((b) => (
                    <tr key={b.budget_id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2">{b.category_name}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(b.limit_amount)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(b.spent_amount)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(b.remaining_amount)}</td>
                      <td className="px-4 py-2 text-right">{toNumber(b.consumed_percent).toFixed(2)}%</td>
                      <td className="px-4 py-2 text-center">
                        {b.over_budget ? (
                          <span className="text-red-600 font-medium">Depasse</span>
                        ) : b.threshold_reached ? (
                          <span className="text-amber-600 font-medium">Seuil</span>
                        ) : (
                          <span className="text-emerald-600 font-medium">OK</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-gray-500" colSpan={6}>
                      Aucun budget configure pour cette periode.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          Donnees indisponibles pour cette periode.
        </div>
      )}
    </div>
  );
}

