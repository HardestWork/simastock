/** Paginated list of inventory counts. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardList, Plus, ChevronLeft } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import type { CountStatus } from '@/api/types';

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<CountStatus, string> = {
  DRAFT: 'Brouillon',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Termine',
  CANCELLED: 'Annule',
};

const STATUS_CLASSES: Record<CountStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: CountStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function CountListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [page, setPage] = useState(1);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    page_size: String(PAGE_SIZE),
    page: String(page),
  };
  if (currentStore?.id) params.store = currentStore.id;
  if (ordering) params.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.counts.list(params),
    queryFn: () => stockApi.counts(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/stock"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            <ChevronLeft size={14} />
            Retour au stock
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} />
            Inventaires
          </h1>
        </div>
        <Link
          to="/stock/counts/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nouvel inventaire
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortableHeader field="created_at" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cree par</th>
                <SortableHeader field="completed_at" label="Termine le" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((count) => (
                <tr key={count.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    {format(new Date(count.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={count.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">{count.created_by_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {count.completed_at
                      ? format(new Date(count.completed_at), 'dd/MM/yyyy HH:mm')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/stock/counts/${count.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Aucun inventaire enregistre.
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
