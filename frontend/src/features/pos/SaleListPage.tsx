/** Sales list page — shows all sales with filters. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { saleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import { Plus, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';

const PAGE_SIZE = 25;

export default function SaleListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sales.list(params),
    queryFn: () => saleApi.list(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  useEffect(() => { setPage(1); }, [ordering]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ventes</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCsv(`sales/export-csv/?store=${currentStore?.id ?? ''}${statusFilter ? `&status=${statusFilter}` : ''}`, 'ventes')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <Download size={16} />
            Exporter CSV
          </button>
          <Link
            to="/pos/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
          >
            <Plus size={18} /> Nouvelle vente
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">Tous les statuts</option>
          <option value="DRAFT">Brouillon</option>
          <option value="PENDING_PAYMENT">En attente</option>
          <option value="PARTIALLY_PAID">Paiement partiel</option>
          <option value="PAID">Payee</option>
          <option value="CANCELLED">Annulee</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
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
              </tr>
            </thead>
            <tbody>
              {data?.results.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{sale.invoice_number || '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sale.customer_name ?? '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sale.seller_name ?? '\u2014'}</td>
                  <td className="px-4 py-3"><StatusBadge type="sale" value={sale.status} /></td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(sale.total)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(sale.amount_due)}</td>
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
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(sale.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <a
                        className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                        href={`/api/v1/sales/${sale.id}/invoice/?kind=invoice`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Facture
                      </a>
                      <a
                        className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                        href={`/api/v1/sales/${sale.id}/invoice/?kind=proforma`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Proforma
                      </a>
                      <a
                        className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                        href={`/api/v1/sales/${sale.id}/invoice/?kind=quote`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Devis
                      </a>
                      {(sale.status === 'PAID' || sale.status === 'PARTIALLY_PAID') && (
                        <a
                          className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                          href={`/api/v1/sales/${sale.id}/receipt/`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Recu
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucune vente trouvee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
