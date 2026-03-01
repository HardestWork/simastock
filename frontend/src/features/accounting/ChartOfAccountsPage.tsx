/** Plan comptable SYSCOHADA — liste des comptes avec recherche et filtres. */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import apiClient from '@/api/client';
import type { AcctAccount, PaginatedResponse } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';

const PAGE_SIZE = 25;

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

const ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les types' },
  { value: 'ASSET', label: 'Actif' },
  { value: 'LIABILITY', label: 'Passif' },
  { value: 'EQUITY', label: 'Capitaux propres' },
  { value: 'INCOME', label: 'Produit' },
  { value: 'EXPENSE', label: 'Charge' },
];

const accountTypeBadge: Record<AccountType, { label: string; classes: string }> = {
  ASSET: { label: 'Actif', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  LIABILITY: { label: 'Passif', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  EQUITY: { label: 'Capitaux propres', classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  INCOME: { label: 'Produit', classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  EXPENSE: { label: 'Charge', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

export default function ChartOfAccountsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter]);

  const params = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      page_size: String(PAGE_SIZE),
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (typeFilter) p.account_type = typeFilter;
    return p;
  }, [page, debouncedSearch, typeFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'accounts', 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<AcctAccount>>('accounting/accounts/', { params });
      return data;
    },
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Plan comptable</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Comptes du systeme comptable SYSCOHADA
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par code ou libelle..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {ACCOUNT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {data?.count ?? 0} compte(s)
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
                    Code
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Libelle
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Type
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Systeme
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Ecritures
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">
                    Actif
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data?.results.map((account) => {
                  const badge = accountTypeBadge[account.account_type];
                  return (
                    <tr
                      key={account.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                        {account.code}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {account.name}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {account.is_system ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                            Systeme
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Personnalise</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {account.allow_entries ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Oui
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            Non
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {account.is_active ? (
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" title="Actif" />
                        ) : (
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600" title="Inactif" />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data?.results.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      Aucun compte trouve.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
