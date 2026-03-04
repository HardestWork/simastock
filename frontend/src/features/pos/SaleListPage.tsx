/** Sales list page — shows all sales with filters. */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saleApi, storeUserApi, reportApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import { useCapabilities } from '@/lib/capabilities';
import StatusBadge from '@/components/shared/StatusBadge';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import { Plus, Download, FileSpreadsheet, Trash2, RotateCcw } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { toast } from '@/lib/toast';
import RefundCreateModal from '@/features/sales/RefundCreateModal';
import type { Sale, StoreUserRecord } from '@/api/types';

const PAGE_SIZE = 25;

/** Generate and download a summary CSV report for the given date range. */
async function exportDailyReport(storeId: string, storeName: string, dateFrom: string, dateTo: string) {
  try {
    const data = await reportApi.sales({ store: storeId, date_from: dateFrom, date_to: dateTo });
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [];

    rows.push([esc('Rapport de ventes'), esc(`${dateFrom} -> ${dateTo}`)].join(';'));
    rows.push([esc('Magasin'), esc(storeName)].join(';'));
    rows.push('');

    // Summary
    rows.push(esc('--- Resume ---'));
    rows.push([esc('Chiffre d\'affaires'), esc(data.summary.total_revenue)].join(';'));
    rows.push([esc('Commandes'), esc(data.summary.total_orders)].join(';'));
    rows.push([esc('Panier moyen'), esc(data.summary.average_order)].join(';'));
    rows.push([esc('Remises'), esc(data.summary.total_discounts)].join(';'));
    rows.push([esc('Encaisse'), esc(data.summary.total_collected)].join(';'));
    rows.push([esc('Impaye'), esc(data.summary.total_outstanding)].join(';'));
    rows.push('');

    // By seller
    if (data.by_seller?.length) {
      rows.push(esc('--- Ventes par vendeur ---'));
      rows.push([esc('Vendeur'), esc('Commandes'), esc('Total')].join(';'));
      for (const s of data.by_seller) {
        rows.push([esc(s.seller), esc(s.order_count), esc(s.total_sales)].join(';'));
      }
      rows.push('');
    }

    // By category
    if (data.by_category?.length) {
      rows.push(esc('--- Ventes par categorie ---'));
      rows.push([esc('Categorie'), esc('Quantite'), esc('Revenu')].join(';'));
      for (const c of data.by_category) {
        rows.push([esc(c.category), esc(c.total_quantity), esc(c.total_revenue)].join(';'));
      }
      rows.push('');
    }

    // By payment method
    if (data.payments_by_method?.length) {
      rows.push(esc('--- Par mode de paiement ---'));
      rows.push([esc('Mode'), esc('Operations'), esc('Montant')].join(';'));
      for (const p of data.payments_by_method) {
        rows.push([esc(p.method), esc(p.count), esc(p.total)].join(';'));
      }
      rows.push('');
    }

    // Breakdown
    if (data.breakdown?.length) {
      rows.push(esc('--- Detail par jour ---'));
      rows.push([esc('Date'), esc('Commandes'), esc('Revenu'), esc('Remises')].join(';'));
      for (const d of data.breakdown) {
        rows.push([esc(d.date), esc(d.orders), esc(d.revenue), esc(d.discounts)].join(';'));
      }
    }

    const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_ventes_${dateFrom}_${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Rapport journalier telecharge.');
  } catch {
    toast.error('Erreur lors de la generation du rapport.');
  }
}

const CANCELLABLE = new Set(['DRAFT', 'PENDING_PAYMENT', 'PARTIALLY_PAID']);

function toLocalIsoDate(date: Date): string {
  const utc = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(utc).toISOString().slice(0, 10);
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export default function SaleListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const capabilities = useCapabilities();
  const canCancel = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canRefund = capabilities.includes('CAN_REFUND');
  const canAdminAdvancedFilters = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayIso);
  const [dateTo, setDateTo] = useState(() => todayIso);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');
  const isTodayRange = dateFrom === todayIso && dateTo === todayIso;

  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null);

  const queryClient = useQueryClient();

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (statusFilter) params.status = statusFilter;
  if (sellerFilter) params.seller = sellerFilter;
  if (cashierFilter) params.cashier = cashierFilter;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;

  const storeUsersFilterParams: Record<string, string> = {
    page_size: '200',
    ...(currentStore?.id ? { store: currentStore.id } : {}),
  };

  const storeUsersQ = useQuery({
    queryKey: ['store-users', 'sales-list-filters', storeUsersFilterParams],
    queryFn: () => storeUserApi.list(storeUsersFilterParams),
    enabled: !!currentStore?.id && canAdminAdvancedFilters,
  });

  const soldTodayParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page_size: '200',
    date_from: todayIso,
    date_to: todayIso,
  };

  const soldTodayQ = useQuery({
    queryKey: ['sales', 'sold-today-users', soldTodayParams],
    queryFn: () => saleApi.list(soldTodayParams),
    enabled: !!currentStore?.id && canAdminAdvancedFilters,
  });

  const storeUsers = storeUsersQ.data?.results ?? [];
  const soldToday = soldTodayQ.data?.results ?? [];
  const soldTodaySellerIds = useMemo(
    () => new Set(soldToday.map((sale) => sale.seller).filter(Boolean)),
    [soldToday],
  );
  const soldTodayCashierNames = useMemo(() => {
    const names = new Set<string>();
    soldToday.forEach((sale) => {
      const value = normalizeValue(sale.cashier_name);
      if (value) names.add(value);
    });
    return names;
  }, [soldToday]);

  const sellerOptions = useMemo<StoreUserRecord[]>(
    () => storeUsers.filter(
      (row) => (row.user_role === 'SALES' || row.user_role === 'SALES_CASHIER')
        && soldTodaySellerIds.has(row.user),
    ),
    [storeUsers, soldTodaySellerIds],
  );
  const cashierOptions = useMemo<StoreUserRecord[]>(
    () => storeUsers.filter(
      (row) => (row.user_role === 'CASHIER' || row.user_role === 'SALES_CASHIER')
        && soldTodayCashierNames.has(normalizeValue(row.user_name || row.user_email)),
    ),
    [storeUsers, soldTodayCashierNames],
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sales.list(params),
    queryFn: () => saleApi.list(params),
    enabled: !!currentStore,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => saleApi.cancel(id, reason),
    onSuccess: () => {
      toast.success('Vente annulee avec succes.');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Erreur lors de l\'annulation.';
      toast.error(msg);
    },
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  useEffect(() => {
    setPage(1);
  }, [ordering, statusFilter, sellerFilter, cashierFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (isTodayRange) return;
    if (sellerFilter) setSellerFilter('');
    if (cashierFilter) setCashierFilter('');
  }, [isTodayRange, sellerFilter, cashierFilter]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ventes</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              const exportParams = new URLSearchParams();
              if (currentStore?.id) exportParams.set('store', currentStore.id);
              if (statusFilter) exportParams.set('status', statusFilter);
              if (sellerFilter) exportParams.set('seller', sellerFilter);
              if (cashierFilter) exportParams.set('cashier', cashierFilter);
              if (dateFrom) exportParams.set('date_from', dateFrom);
              if (dateTo) exportParams.set('date_to', dateTo);
              downloadCsv(`sales/export-csv/?${exportParams.toString()}`, 'ventes');
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors w-full sm:w-auto justify-center"
          >
            <Download size={16} />
            Exporter CSV
          </button>
          <button
            onClick={() => {
              if (currentStore?.id) {
                exportDailyReport(
                  currentStore.id,
                  currentStore.name ?? 'Boutique',
                  dateFrom || todayIso,
                  dateTo || todayIso,
                );
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-green-300 dark:border-green-600 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors w-full sm:w-auto justify-center"
          >
            <FileSpreadsheet size={16} />
            Rapport journalier
          </button>
          <Link
            to="/pos/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm w-full sm:w-auto"
          >
            <Plus size={18} /> Nouvelle vente
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
              Statut
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Tous les statuts</option>
              <option value="DRAFT">Brouillon</option>
              <option value="PENDING_PAYMENT">En attente</option>
              <option value="PARTIALLY_PAID">Paiement partiel</option>
              <option value="PAID">Payee</option>
              <option value="CANCELLED">Annulee</option>
            </select>
          </div>

          {canAdminAdvancedFilters && (
            <>
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
                  Du
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
                  Au
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {isTodayRange ? (
                <>
                  <div className="w-full sm:w-auto sm:min-w-[220px]">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
                      Vendeur (ventes du jour)
                    </label>
                    <select
                      value={sellerFilter}
                      onChange={(e) => setSellerFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="">Tous les vendeurs du jour</option>
                      {sellerOptions.map((entry) => (
                        <option key={entry.user} value={entry.user}>
                          {entry.user_name || entry.user_email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-full sm:w-auto sm:min-w-[220px]">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">
                      Caissier (ventes du jour)
                    </label>
                    <select
                      value={cashierFilter}
                      onChange={(e) => setCashierFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="">Tous les caissiers du jour</option>
                      {cashierOptions.map((entry) => (
                        <option key={entry.user} value={entry.user}>
                          {entry.user_name || entry.user_email}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Hors ventes du jour, utilisez les filtres de date (du/au).
                </p>
              )}
            </>
          )}

          {(statusFilter || sellerFilter || cashierFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('');
                setSellerFilter('');
                setCashierFilter('');
                setDateFrom(todayIso);
                setDateTo(todayIso);
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              Reinitialiser
            </button>
          )}
        </div>

        {canAdminAdvancedFilters && (storeUsersQ.isLoading || soldTodayQ.isLoading) && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Chargement des utilisateurs...
          </p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <SortableHeader field="invoice_number" label="Facture" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vendeur</th>
                  <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <SortableHeader field="total" label="Total" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                  <SortableHeader field="amount_due" label="Reste du" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Source</th>
                  <SortableHeader field="created_at" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Docs</th>
                  {(canCancel || canRefund) && <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-24" />}
                </tr>
              </thead>
              <tbody>
                {data?.results.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{sale.invoice_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sale.customer_name ?? '\u2014'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sale.seller_name ?? '\u2014'}</td>
                    <td className="px-4 py-3"><StatusBadge type="sale" value={sale.status} /></td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatCurrency(sale.total)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatCurrency(sale.amount_due)}</td>
                    <td className="px-4 py-3">
                      {sale.source_quote_number ? (
                        <Link
                          to={`/quotes/${sale.source_quote}`}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
                        >
                          {sale.source_quote_number}
                        </Link>
                      ) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(sale.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <a
                          className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap"
                          href={`/api/v1/sales/${sale.id}/invoice/?kind=invoice`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Facture
                        </a>
                        {(sale.status === 'PAID' || sale.status === 'PARTIALLY_PAID') && (
                          <a
                            className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap"
                            href={`/api/v1/sales/${sale.id}/receipt/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Recu
                          </a>
                        )}
                      </div>
                    </td>
                    {(canCancel || canRefund) && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canRefund && (sale.status === 'PAID' || sale.status === 'PARTIALLY_PAID') && (
                            <button
                              onClick={() => setRefundTarget(sale)}
                              title="Rembourser cette vente"
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          {canCancel && CANCELLABLE.has(sale.status) && (
                            <button
                              onClick={() => { setCancelTarget(sale); setCancelReason(''); }}
                              title="Annuler cette vente"
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {data?.results.length === 0 && (
                  <tr>
                    <td colSpan={(canCancel || canRefund) ? 10 : 9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Aucune vente trouvee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Refund modal */}
      {refundTarget && (
        <RefundCreateModal
          sale={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => setRefundTarget(null)}
        />
      )}

      {/* Cancel confirmation dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Annuler cette vente ?"
        message={cancelTarget
          ? `La vente ${cancelTarget.invoice_number || 'brouillon'} de ${formatCurrency(cancelTarget.total)} sera annulee. Cette action est irreversible.`
          : ''}
        confirmLabel="Annuler la vente"
        cancelLabel="Fermer"
        tone="danger"
        loading={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelTarget && cancelReason.trim()) {
            cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() });
          }
        }}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Raison de l'annulation (obligatoire)"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
        />
        {cancelReason.trim() === '' && (
          <p className="text-xs text-red-500 mt-1">Veuillez indiquer une raison pour annuler.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
