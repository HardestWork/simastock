/** Balance generale (balance de verification) — trial balance par exercice fiscal. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { BalanceGeneraleRow, FiscalYear, PaginatedResponse } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

const accountTypeLabel: Record<AccountType, string> = {
  ASSET: 'Actif',
  LIABILITY: 'Passif',
  EQUITY: 'Capitaux propres',
  INCOME: 'Produit',
  EXPENSE: 'Charge',
};

export default function BalanceGeneralePage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [fiscalYearFilter, setFiscalYearFilter] = useState('');

  // Fetch fiscal years for the dropdown
  const { data: fiscalYearData } = useQuery({
    queryKey: ['accounting', 'fiscal-years', 'list-all'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<FiscalYear>>('accounting/fiscal-years/', {
        params: { page_size: '50' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (fiscalYearFilter) p.fiscal_year = fiscalYearFilter;
    return p;
  }, [fiscalYearFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'balance-generale', params],
    queryFn: async () => {
      const { data } = await apiClient.get<BalanceGeneraleRow[]>('accounting/reports/balance-generale/', {
        params,
      });
      return data;
    },
    enabled: !!currentStore,
  });

  // Calculate totals
  const totals = useMemo(() => {
    if (!data || data.length === 0) return { debit: 0, credit: 0, solde: 0 };
    return data.reduce(
      (acc, row) => ({
        debit: acc.debit + parseFloat(row.total_debit || '0'),
        credit: acc.credit + parseFloat(row.total_credit || '0'),
        solde: acc.solde + parseFloat(row.solde || '0'),
      }),
      { debit: 0, credit: 0, solde: 0 },
    );
  }, [data]);

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Balance generale</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Balance de verification des comptes
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Exercice fiscal :
          </label>
          <select
            value={fiscalYearFilter}
            onChange={(e) => setFiscalYearFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[250px]"
          >
            <option value="">Tous les exercices</option>
            {fiscalYearData?.results.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.status === 'OPEN' ? 'Ouvert' : 'Cloture'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Code Compte
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Libelle
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Type
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Total Debit
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Total Credit
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Solde
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data?.map((row, idx) => {
                  const soldeNum = parseFloat(row.solde || '0');
                  return (
                    <tr
                      key={`${row.account_code}-${idx}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                        {row.account_code}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {row.account_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {accountTypeLabel[row.account_type as AccountType] ?? row.account_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(row.total_debit)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(row.total_credit)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-semibold ${
                          soldeNum > 0
                            ? 'text-blue-700 dark:text-blue-400'
                            : soldeNum < 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {formatCurrency(row.solde)}
                      </td>
                    </tr>
                  );
                })}

                {(!data || data.length === 0) && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      Aucune donnee disponible pour cette selection.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Summary totals row */}
              {data && data.length > 0 && (
                <tfoot className="bg-gray-100 dark:bg-gray-700/70 border-t-2 border-gray-300 dark:border-gray-600">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100"
                    >
                      TOTAL
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(totals.debit)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(totals.credit)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-bold ${
                        Math.abs(totals.solde) < 0.01
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(totals.solde)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
