/** Paginated list of stock transfers. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeftRight, Plus, ChevronLeft } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import type { TransferStatus } from '@/api/types';

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuve',
  IN_TRANSIT: 'En transit',
  RECEIVED: 'Recu',
  CANCELLED: 'Annule',
};

const STATUS_CLASSES: Record<TransferStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function TransferListPage() {
  const [page, setPage] = useState(1);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    page_size: String(PAGE_SIZE),
    page: String(page),
  };
  if (ordering) params.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.transfers.list(params),
    queryFn: () => stockApi.transfers(params),
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/stock"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
          >
            <ChevronLeft size={14} />
            Retour au stock
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ArrowLeftRight size={24} />
            Transferts de stock
          </h1>
        </div>
        <Link
          to="/stock/transfers/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nouveau transfert
        </Link>
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
                <SortableHeader field="created_at" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Destination</th>
                <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Cree par</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((transfer) => (
                <tr key={transfer.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {format(new Date(transfer.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{transfer.from_store_name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{transfer.to_store_name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={transfer.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{transfer.created_by_name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/stock/transfers/${transfer.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun transfert enregistre.
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
