/** Purchase orders list page — full-featured with filters, search, delete, and navigation. */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseOrderApi } from '@/api/endpoints';
import type { PurchaseOrderStatus } from '@/api/types';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import Pagination from '@/components/shared/Pagination';
import { Search, Plus, Trash2, Truck, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PAGE_SIZE = 25;

const statusConfig: Record<PurchaseOrderStatus, { label: string; classes: string }> = {
  DRAFT: { label: 'Brouillon', classes: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  SUBMITTED: { label: 'Soumis', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PARTIALLY_RECEIVED: { label: 'Partiel', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  RECEIVED: { label: 'Recu', classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  CANCELLED: { label: 'Annule', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'SUBMITTED', label: 'Soumis' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partiellement recu' },
  { value: 'RECEIVED', label: 'Recu' },
  { value: 'CANCELLED', label: 'Annule' },
];

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  // Reset page when filters or ordering change
  useEffect(() => { setPage(1); }, [ordering, statusFilter, debouncedSearch]);

  // Build query params
  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (statusFilter) params.status = statusFilter;
  if (debouncedSearch) params.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.purchaseOrders.list(params),
    queryFn: () => purchaseOrderApi.list(params),
    enabled: !!currentStore,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseOrderApi.delete(id),
    onSuccess: () => {
      toast.success('Bon de commande supprime');
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
    onError: (err: unknown) => {
      toast.error(
        (err as any)?.response?.data?.detail
        || (err as any)?.response?.data?.non_field_errors?.[0]
        || 'Erreur lors de la suppression',
      );
    },
  });

  const handleDelete = (e: React.MouseEvent, id: string, poNumber: string) => {
    e.stopPropagation();
    if (window.confirm(`Supprimer le bon de commande ${poNumber} ?`)) {
      deleteMutation.mutate(id);
    }
  };

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Bons de commande
        </h1>
        <div className="flex items-center gap-3">
          <Link
            to="/purchases/suppliers"
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm"
          >
            <Truck size={18} />
            Fournisseurs
          </Link>
          <Link
            to="/purchases/orders/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
          >
            <Plus size={18} />
            Nouveau BC
          </Link>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full sm:w-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par numero, fournisseur..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <SortableHeader
                    field="po_number"
                    label="N° commande"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={toggleSort}
                    align="left"
                  />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    Fournisseur
                  </th>
                  <SortableHeader
                    field="status"
                    label="Statut"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={toggleSort}
                    align="left"
                  />
                  <SortableHeader
                    field="subtotal"
                    label="Total"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeader
                    field="created_at"
                    label="Date"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={toggleSort}
                    align="left"
                  />
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.results.map((po) => {
                  const status = statusConfig[po.status];
                  return (
                    <tr
                      key={po.id}
                      className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => navigate(`/purchases/orders/${po.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          to={`/purchases/orders/${po.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {po.po_number || '\u2014'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {po.supplier_name || '\u2014'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.classes}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(po.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {format(new Date(po.created_at), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {po.status === 'DRAFT' && (
                          <button
                            onClick={(e) => handleDelete(e, po.id, po.po_number)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
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
                      <div className="flex flex-col items-center gap-2">
                        <Truck size={32} className="text-gray-300 dark:text-gray-600" />
                        <p className="text-sm">Aucun bon de commande trouve.</p>
                        {(debouncedSearch || statusFilter) && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Essayez de modifier vos filtres de recherche.
                          </p>
                        )}
                      </div>
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
