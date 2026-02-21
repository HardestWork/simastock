/** Credit accounts list page. */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Search, ChevronRight, X, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { creditApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import { toast } from '@/lib/toast';
import type { CustomerAccount } from '@/api/types';

const PAGE_SIZE = 25;

function errDetail(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string } | string>;
  const data = ax?.response?.data;
  if (typeof data === 'string') {
    const status = ax?.response?.status;
    if (status === 403 && data.toLowerCase().includes('csrf')) {
      return 'CSRF: session invalide. Rechargez la page puis reessayez.';
    }
    return status ? `Erreur serveur (${status}).` : 'Erreur serveur.';
  }
  return (data as { detail?: string } | undefined)?.detail ?? (err as Error)?.message ?? 'Erreur.';
}

const getHealthColor = (a: CustomerAccount) => {
  const bal = parseFloat(a.balance);
  const lim = parseFloat(a.credit_limit);
  if (lim <= 0) return 'bg-gray-400';
  if (bal > lim) return 'bg-red-500';
  const avail = parseFloat(a.available_credit);
  if (avail < lim * 0.2) return 'bg-amber-500';
  return 'bg-emerald-500';
};

export default function CreditListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('balance', 'desc');

  const [selected, setSelected] = useState<CustomerAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (debouncedSearch) params.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.creditAccounts.list(params),
    queryFn: () => creditApi.accounts(params),
    enabled: !!currentStore,
  });

  const payMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Aucun compte selectionne.');
      const payload: { amount: string; reference?: string } = { amount };
      if (reference.trim()) payload.reference = reference.trim();
      await creditApi.pay(selected.id, payload);
    },
    onSuccess: async () => {
      toast.success(
        `Paiement credit enregistre: ${selected?.customer_name ?? selected?.customer ?? 'Client'} (${formatCurrency(amount || '0')})`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.creditAccounts.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creditLedger.all });
      setSuccessMsg(
        `Paiement enregistre pour ${selected?.customer_name ?? selected?.customer ?? 'le client'}.`,
      );
      setTimeout(() => setSuccessMsg(null), 3500);
      setSelected(null);
      setAmount('');
      setReference('');
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  const openPay = (account: CustomerAccount) => {
    setSelected(account);
    setSuccessMsg(null);
    setAmount(String(Math.max(0, parseFloat(account.balance) || 0)));
    setReference('');
  };

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Comptes credit</h1>
        <button
          onClick={() => downloadCsv(`credit-accounts/export-csv/?store=${currentStore?.id ?? ''}`, 'credits')}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Download size={16} />
          Exporter CSV
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom du client..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
          />
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
                <SortableHeader field="customer__last_name" label="Client" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="credit_limit" label="Limite" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="balance" label="Solde" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Disponible</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Sante</th>
                <SortableHeader field="is_active" label="Actif" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((account) => (
                <tr
                  key={account.id}
                  onClick={() => {
                    const bal = parseFloat(account.balance) || 0;
                    if (bal <= 0) {
                      navigate('/credits/' + account.id);
                      return;
                    }
                    openPay(account);
                  }}
                  className="border-b border-gray-50 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{account.customer_name ?? account.customer}</div>
                    {account.customer_phone && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{account.customer_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(account.credit_limit)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(account.balance)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(account.available_credit)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${getHealthColor(account)}`} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${account.is_active ? 'bg-success' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate('/credits/' + account.id); }}
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      title="Voir le detail"
                    >
                      Details <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun compte credit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Quick payment modal */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !payMut.isPending && setSelected(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-200">
                <div className="min-w-0">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Encaisser un paiement</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {selected.customer_name ?? selected.customer}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Solde: <span className="font-medium text-red-600">{formatCurrency(selected.balance)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  disabled={payMut.isPending}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  title="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {successMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
                    {successMsg}
                  </div>
                )}
                {payMut.isError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {errDetail(payMut.error)}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant</label>
                    <input
                      type="number"
                      min="1"
                      max={parseFloat(selected.balance) || undefined}
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.max(0, parseFloat(selected.balance) || 0)))}
                      className="mt-1 text-xs text-primary hover:underline"
                    >
                      Tout payer
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference (optionnel)</label>
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/credits/' + selected.id)}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:underline"
                    disabled={payMut.isPending}
                  >
                    Voir detail
                  </button>
                  <button
                    type="button"
                    onClick={() => payMut.mutate()}
                    disabled={
                      payMut.isPending ||
                      !amount ||
                      parseFloat(amount) <= 0 ||
                      parseFloat(amount) > (parseFloat(selected.balance) || 0)
                    }
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {payMut.isPending ? 'Traitement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

