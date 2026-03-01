/** Reports page with advanced filters and sales analytics table. */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerApi, productApi, reportApi, storeApi, storeUserApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { toast } from '@/lib/toast';

type ReportType = 'sales' | 'cashier_operations';

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function exportBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);

  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [dateFrom, setDateFrom] = useState(toLocalIsoDate(startOfMonth));
  const [dateTo, setDateTo] = useState(todayIso);
  const [customerFilter, setCustomerFilter] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data: myStores, isLoading: isStoresLoading } = useQuery({
    queryKey: queryKeys.myStores,
    queryFn: () => storeApi.myStores(),
  });

  useEffect(() => {
    if (!selectedStoreId && currentStore?.id) {
      setSelectedStoreId(currentStore.id);
      return;
    }
    if (!selectedStoreId && myStores && myStores.length > 0) {
      setSelectedStoreId(myStores[0].id);
    }
  }, [currentStore?.id, myStores, selectedStoreId]);

  const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const salesFilters = useMemo(
    () => ({
      store: selectedStoreId,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      customer: customerFilter || undefined,
      cashier: cashierFilter || undefined,
      product: productFilter || undefined,
    }),
    [selectedStoreId, dateFrom, dateTo, customerFilter, cashierFilter, productFilter],
  );

  const {
    data,
    isLoading,
    refetch: refetchSales,
  } = useQuery({
    queryKey: queryKeys.salesReport(
      selectedStoreId,
      dateFrom,
      dateTo,
      'day',
      customerFilter || undefined,
      cashierFilter || undefined,
      productFilter || undefined,
    ),
    queryFn: () => reportApi.sales(salesFilters),
    enabled: !!selectedStoreId && reportType === 'sales' && !hasInvalidDateRange,
  });

  const { data: customersData } = useQuery({
    queryKey: queryKeys.customers.list({ page_size: '200', ordering: 'last_name' }),
    queryFn: () => customerApi.list({ page_size: '200', ordering: 'last_name' }),
    enabled: !!selectedStoreId,
  });

  const { data: storeUsersData } = useQuery({
    queryKey: ['store-users', selectedStoreId],
    queryFn: () => storeUserApi.list({ store: selectedStoreId, page_size: '200' }),
    enabled: !!selectedStoreId,
  });

  const cashierOptions = useMemo(
    () =>
      (storeUsersData?.results ?? []).filter((row) =>
        ['CASHIER', 'MANAGER', 'ADMIN'].includes(row.user_role),
      ),
    [storeUsersData?.results],
  );

  const { data: productsData } = useQuery({
    queryKey: queryKeys.products.list({ page_size: '200', ordering: 'name' }),
    queryFn: () => productApi.list({ page_size: '200', ordering: 'name' }),
    enabled: !!selectedStoreId,
  });

  const clearFilters = () => {
    setReportType('sales');
    setDateFrom(toLocalIsoDate(startOfMonth));
    setDateTo(todayIso);
    setCustomerFilter('');
    setCashierFilter('');
    setProductFilter('');
  };

  const applyLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setDateFrom(toLocalIsoDate(start));
    setDateTo(toLocalIsoDate(end));
  };

  const exportCashierOperationsPdf = async () => {
    if (!selectedStoreId) return;
    if (hasInvalidDateRange) {
      toast.error('Periode invalide: la date de debut doit etre <= date de fin.');
      return;
    }

    setIsExportingPdf(true);
    try {
      const blob = await reportApi.cashierOperationsPdf({
        store: selectedStoreId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        customer: customerFilter || undefined,
        cashier: cashierFilter || undefined,
        product: productFilter || undefined,
      });
      exportBlob(blob, `operations_caissiers_${dateFrom || 'start'}_${dateTo || 'end'}.pdf`);
      toast.success('PDF operations caissiers telecharge.');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(detail || 'Erreur lors de la generation du PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportSalesCsv = () => {
    if (!data) return;

    const rows: string[] = [];
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const storeName = (myStores ?? []).find((store) => store.id === selectedStoreId)?.name ?? selectedStoreId;

    rows.push([escape('Rapport ventes'), escape(`${dateFrom} -> ${dateTo}`)].join(';'));
    rows.push([escape('Magasin'), escape(storeName)].join(';'));
    rows.push([
      escape('Filtres'),
      escape(`Client=${customerFilter || 'Tous'} | Caissier=${cashierFilter || 'Tous'} | Produit=${productFilter || 'Tous'}`),
    ].join(';'));
    rows.push('');
    rows.push([escape('Indicateur'), escape('Valeur')].join(';'));
    rows.push([escape('Chiffre d\'affaires'), escape(data.summary.total_revenue)].join(';'));
    rows.push([escape('Commandes'), escape(data.summary.total_orders)].join(';'));
    rows.push([escape('Panier moyen'), escape(data.summary.average_order)].join(';'));
    rows.push([escape('Encaisse'), escape(data.summary.total_collected)].join(';'));
    rows.push([escape('Impaye'), escape(data.summary.total_outstanding)].join(';'));

    rows.push('');
    rows.push([escape('Ventes par vendeur')].join(';'));
    rows.push([escape('Vendeur'), escape('Commandes'), escape('Total')].join(';'));
    data.by_seller.forEach((item) => {
      rows.push([escape(item.seller), escape(item.order_count), escape(item.total_sales)].join(';'));
    });

    rows.push('');
    rows.push([escape('Ventes par categorie')].join(';'));
    rows.push([escape('Categorie'), escape('Quantite'), escape('Revenu')].join(';'));
    data.by_category.forEach((item) => {
      rows.push([escape(item.category || 'Sans categorie'), escape(item.total_quantity), escape(item.total_revenue)].join(';'));
    });

    rows.push('');
    rows.push([escape('Paiements par mode')].join(';'));
    rows.push([escape('Mode'), escape('Operations'), escape('Montant')].join(';'));
    data.payments_by_method.forEach((item) => {
      rows.push([escape(item.method), escape(item.count), escape(item.total)].join(';'));
    });

    rows.push('');
    rows.push([escape(`Detail par ${data.group_by || 'jour'}`)].join(';'));
    rows.push([escape('Date'), escape('Commandes'), escape('Revenu'), escape('Remises')].join(';'));
    data.breakdown.forEach((item) => {
      rows.push([escape(item.date), escape(item.orders), escape(item.revenue), escape(item.discounts)].join(';'));
    });

    const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    exportBlob(blob, `rapport_ventes_${dateFrom}_${dateTo}.csv`);
    toast.success('CSV ventes telecharge.');
  };

  if (isStoresLoading && !selectedStoreId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!selectedStoreId) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucune boutique disponible.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Rapports</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-x-6 gap-y-4 items-center">
          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Magasin</label>
          <select
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
              setCashierFilter('');
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            {(myStores ?? []).map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Type de rapport</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="sales">Ventes detaillees</option>
            <option value="cashier_operations">Operations par caissier (PDF)</option>
          </select>

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Debut</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 ${
              hasInvalidDateRange
                ? 'border-red-500 dark:border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Fin</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 ${
              hasInvalidDateRange
                ? 'border-red-500 dark:border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Client (Optionnel)</label>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous les clients</option>
            {customersData?.results.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.full_name}</option>
            ))}
          </select>

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Caissier (Optionnel)</label>
          <select
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous les caissiers</option>
            {cashierOptions.map((entry) => (
              <option key={entry.user} value={entry.user}>{entry.user_name || entry.user_email}</option>
            ))}
          </select>

          <label className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Produit (Optionnel)</label>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous les produits</option>
            {productsData?.results.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => applyLastDays(1)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >Aujourd'hui</button>
          <button
            type="button"
            onClick={() => applyLastDays(7)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >7 jours</button>
          <button
            type="button"
            onClick={() => applyLastDays(30)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >30 jours</button>
          <button
            type="button"
            onClick={() => {
              setDateFrom(toLocalIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
              setDateTo(todayIso);
            }}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >Mois en cours</button>
        </div>

        {hasInvalidDateRange && (
          <p className="mt-3 text-sm text-red-600">Periode invalide: la date de debut doit etre anterieure ou egale a la date de fin.</p>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Effacer
          </button>

          {reportType === 'sales' ? (
            <>
              <button
                type="button"
                onClick={() => refetchSales()}
                disabled={hasInvalidDateRange}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
              >
                Actualiser
              </button>
              <button
                type="button"
                onClick={exportSalesCsv}
                disabled={!data}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60"
              >
                Export CSV
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={exportCashierOperationsPdf}
              disabled={isExportingPdf || hasInvalidDateRange}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60"
            >
              {isExportingPdf ? 'Generation PDF...' : 'Generer PDF'}
            </button>
          )}
        </div>
      </div>

      {reportType === 'cashier_operations' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6 text-sm text-gray-600 dark:text-gray-300">
          Ce rapport produit un PDF "Operations par caissier" adapte a la boutique et aux filtres selectionnes.
        </div>
      )}

      {reportType === 'sales' && (isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Chiffre d'affaires</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data.summary?.total_revenue ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Commandes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary?.total_orders ?? 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Panier moyen</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data.summary?.average_order ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Encaisse</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data.summary?.total_collected ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Remises</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data.summary?.total_discounts ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Impaye</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data.summary?.total_outstanding ?? 0)}</p>
            </div>
          </div>

          {data.by_seller && data.by_seller.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-700">Ventes par vendeur</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vendeur</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Commandes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_seller.map((s, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium">{s.seller}</td>
                      <td className="px-4 py-3 text-right">{s.order_count}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.total_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.by_category && data.by_category.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-700">Ventes par categorie</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Categorie</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Quantite</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_category.map((c, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium">{c.category ?? 'Sans categorie'}</td>
                      <td className="px-4 py-3 text-right">{c.total_quantity}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.payments_by_method && data.payments_by_method.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mt-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-700">Encaissements par mode</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Mode</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Operations</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments_by_method.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium">{row.method}</td>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.breakdown && data.breakdown.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mt-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                Evolution ({data.group_by === 'month' ? 'mensuelle' : data.group_by === 'year' ? 'annuelle' : 'quotidienne'})
              </h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Commandes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Revenu</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Remises</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium">{row.date}</td>
                      <td className="px-4 py-3 text-right">{row.orders}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.discounts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-600 dark:text-gray-300">
          Aucune donnee de ventes pour cette periode/filtres.
        </div>
      ))}
    </div>
  );
}
