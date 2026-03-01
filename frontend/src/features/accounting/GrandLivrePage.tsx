/** Grand livre (general ledger) — detail des mouvements par compte. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type {
  AcctAccount,
  FiscalYear,
  GrandLivreRow,
  PaginatedResponse,
} from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function GrandLivrePage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [accountFilter, setAccountFilter] = useState('');
  const [fiscalYearFilter, setFiscalYearFilter] = useState('');

  // Fetch all accounts for the dropdown
  const { data: accountData } = useQuery({
    queryKey: ['accounting', 'accounts', 'list-all'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<AcctAccount>>('accounting/accounts/', {
        params: { page_size: '1000', allow_entries: 'true', is_active: 'true' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

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
    if (accountFilter) p.account = accountFilter;
    if (fiscalYearFilter) p.fiscal_year = fiscalYearFilter;
    return p;
  }, [accountFilter, fiscalYearFilter]);

  const hasFilters = !!accountFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'grand-livre', params],
    queryFn: async () => {
      const { data } = await apiClient.get<GrandLivreRow[]>('accounting/reports/grand-livre/', {
        params,
      });
      return data;
    },
    enabled: !!currentStore && hasFilters,
  });

  // Find selected account info for display
  const selectedAccount = useMemo(() => {
    if (!accountFilter || !accountData) return null;
    return accountData.results.find((a) => a.id === accountFilter) ?? null;
  }, [accountFilter, accountData]);

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Grand livre</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Detail des mouvements par compte comptable
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Compte comptable *
            </label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">Selectionner un compte...</option>
              {accountData?.results.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Exercice fiscal
            </label>
            <select
              value={fiscalYearFilter}
              onChange={(e) => setFiscalYearFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
      </div>

      {/* Selected account info */}
      {selectedAccount && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">Compte :</span>{' '}
              <span className="font-mono font-bold text-blue-900 dark:text-blue-100">
                {selectedAccount.code}
              </span>{' '}
              <span className="text-blue-800 dark:text-blue-200">{selectedAccount.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* Prompt to select an account */}
      {!hasFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Veuillez selectionner un compte comptable pour afficher le grand livre.
          </p>
        </div>
      )}

      {/* Table */}
      {hasFilters && (
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
                      Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Journal
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      N. Seq
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Libelle
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Reference
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Debit
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Credit
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                      Solde cumule
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data?.map((row, idx) => {
                    const soldeNum = parseFloat(row.solde || '0');
                    return (
                      <tr
                        key={`${row.sequence_number}-${idx}`}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {row.entry_date
                            ? format(new Date(row.entry_date), 'dd MMM yyyy', { locale: fr })
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                          {row.journal_code}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">
                          {row.sequence_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[250px] truncate">
                          {row.label || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {row.reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                          {parseFloat(row.debit || '0') > 0 ? formatCurrency(row.debit) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                          {parseFloat(row.credit || '0') > 0 ? formatCurrency(row.credit) : '-'}
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
                        colSpan={8}
                        className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        Aucun mouvement pour ce compte.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
