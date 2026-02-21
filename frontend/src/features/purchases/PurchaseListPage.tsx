/** Purchase orders list page. */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { purchaseOrderApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';

const PAGE_SIZE = 25;

export default function PurchaseListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [page, setPage] = useState(1);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.purchaseOrders.list(params),
    queryFn: () => purchaseOrderApi.list(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Bons de commande</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <SortableHeader field="po_number" label="N° commande" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Fournisseur</th>
                <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="subtotal" label="Total" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {data?.results.map((po) => (
                <tr key={po.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium">{po.po_number}</td>
                  <td className="px-4 py-3">{po.supplier_name}</td>
                  <td className="px-4 py-3">{po.status}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(po.subtotal)}</td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun bon de commande.
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
