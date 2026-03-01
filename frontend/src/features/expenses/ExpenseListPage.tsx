import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Search, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { expenseApi } from '@/api/endpoints';
import { downloadCsv } from '@/lib/export';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';

const PAGE_SIZE = 25;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const userRole = useAuthStore((s) => s.user?.role);
  const canVoid = userRole === 'ADMIN' || userRole === 'MANAGER';
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [walletFilter, setWalletFilter] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ id: string; number: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [formCategory, setFormCategory] = useState('');
  const [formWallet, setFormWallet] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(todayIsoDate());
  const [formSupplier, setFormSupplier] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('expense_date', 'desc');

  useEffect(() => {
    setPage(1);
  }, [ordering, debouncedSearch, statusFilter, categoryFilter, walletFilter]);

  const expenseParams = useMemo(() => {
    if (!currentStore) return null;
    const params: Record<string, string> = {
      store: currentStore.id,
      page: String(page),
      page_size: String(PAGE_SIZE),
    };
    if (ordering) params.ordering = ordering;
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    if (walletFilter) params.wallet = walletFilter;
    return params;
  }, [currentStore, page, ordering, debouncedSearch, statusFilter, categoryFilter, walletFilter]);

  const exportQuery = useMemo(() => {
    if (!currentStore) return '';
    const params = new URLSearchParams({ store: currentStore.id });
    if (ordering) params.set('ordering', ordering);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (walletFilter) params.set('wallet', walletFilter);
    return params.toString();
  }, [currentStore, ordering, debouncedSearch, statusFilter, categoryFilter, walletFilter]);

  const { data: categoryData } = useQuery({
    queryKey: queryKeys.expenseCategories.list(currentStore ? { page_size: '300', is_active: 'true' } : undefined),
    queryFn: () => expenseApi.categories({ page_size: '300', is_active: 'true' }),
    enabled: !!currentStore,
  });

  const { data: walletData } = useQuery({
    queryKey: queryKeys.wallets.list(currentStore ? { store: currentStore.id, page_size: '200' } : undefined),
    queryFn: () => expenseApi.wallets({ store: currentStore!.id, page_size: '200', is_active: 'true' }),
    enabled: !!currentStore,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.expenses.list(expenseParams ?? undefined),
    queryFn: () => expenseApi.expenses(expenseParams ?? undefined),
    enabled: !!expenseParams,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      expenseApi.createExpense({
        store: currentStore!.id,
        category: formCategory,
        wallet: formWallet,
        amount: formAmount,
        expense_date: formDate,
        supplier_name: formSupplier.trim() || undefined,
        description: formDescription.trim(),
      }),
    onSuccess: (created) => {
      toast.success(`Depense enregistree: ${created.expense_number}`);
      setOpenCreate(false);
      setFormCategory('');
      setFormWallet('');
      setFormAmount('');
      setFormDate(todayIsoDate());
      setFormSupplier('');
      setFormDescription('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenseBudgets.all });
      if (currentStore) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.dashboard(currentStore.id) });
      }
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err, 'Erreur lors de la creation de la depense'));
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => {
      if (!voidTarget) throw new Error('Aucune depense selectionnee');
      return expenseApi.voidExpense(voidTarget.id, voidReason.trim() || undefined);
    },
    onSuccess: () => {
      toast.warning(`Depense annulee: ${voidTarget?.number ?? 'sans numero'}`);
      setVoidTarget(null);
      setVoidReason('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenseBudgets.all });
      if (currentStore) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.dashboard(currentStore.id) });
      }
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err, 'Annulation impossible'));
    },
  });

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  const availableCategories = (categoryData?.results ?? []).filter(
    (c) => !c.store || c.store === currentStore.id,
  );

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Depenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boutique: {currentStore.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/expenses/dashboard"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            Dashboard
          </Link>
          <Link
            to="/expenses/settings"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            Parametres
          </Link>
          <button
            onClick={() => downloadCsv(`expenses/export-csv/?${exportQuery}`, 'depenses')}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <Download size={16} />
            Exporter CSV
          </button>
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={16} />
            Nouvelle depense
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher numero, description, fournisseur..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous statuts</option>
            <option value="POSTED">Validee</option>
            <option value="VOIDED">Annulee</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Toutes categories</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={walletFilter}
            onChange={(e) => setWalletFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous wallets</option>
            {walletData?.results.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-end">
            {data?.count ?? 0} depense(s)
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <SortableHeader field="expense_number" label="Numero" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="expense_date" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Categorie</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Wallet</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Description</th>
                <SortableHeader field="amount" label="Montant" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((expense) => (
                <tr key={expense.id} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="px-4 py-3 font-medium">{expense.expense_number}</td>
                  <td className="px-4 py-3">{expense.expense_date}</td>
                  <td className="px-4 py-3">{expense.category_name}</td>
                  <td className="px-4 py-3">{expense.wallet_name}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{expense.description}</div>
                    {expense.supplier_name && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">Fournisseur: {expense.supplier_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        expense.status === 'POSTED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {expense.status === 'POSTED' ? 'Validee' : 'Annulee'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canVoid && expense.status === 'POSTED' ? (
                      <button
                        onClick={() => setVoidTarget({ id: expense.id, number: expense.expense_number })}
                        className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucune depense trouvee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {openCreate && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !createMutation.isPending && setOpenCreate(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nouvelle depense</h2>
                <button
                  onClick={() => setOpenCreate(false)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  disabled={createMutation.isPending}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Categorie *</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="">Selectionner...</option>
                      {availableCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Wallet *</label>
                    <select
                      value={formWallet}
                      onChange={(e) => setFormWallet(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="">Selectionner...</option>
                      {walletData?.results.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Montant *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Date *</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Fournisseur</label>
                    <input
                      type="text"
                      value={formSupplier}
                      onChange={(e) => setFormSupplier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Description *</label>
                    <textarea
                      rows={3}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={
                      createMutation.isPending ||
                      !formCategory ||
                      !formWallet ||
                      !formAmount ||
                      Number(formAmount) <= 0 ||
                      !formDate ||
                      !formDescription.trim()
                    }
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {createMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !voidMutation.isPending && setVoidTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5">
              <h3 className="text-lg font-semibold mb-2">Annuler {voidTarget.number}</h3>
              <p className="text-sm text-gray-500 mb-3">Cette action remettra le montant dans le wallet.</p>
              <textarea
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Motif (optionnel)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setVoidTarget(null)}
                  disabled={voidMutation.isPending}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  Fermer
                </button>
                <button
                  onClick={() => voidMutation.mutate()}
                  disabled={voidMutation.isPending}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-60"
                >
                  {voidMutation.isPending ? 'Annulation...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

