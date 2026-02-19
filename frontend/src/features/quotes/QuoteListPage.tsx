/** Quotes list page — shows all quotes (devis) with filters. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { quoteApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import { Plus } from 'lucide-react';

const PAGE_SIZE = 25;

export default function QuoteListPage() {
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
    queryKey: queryKeys.quotes.list(params),
    queryFn: () => quoteApi.list(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  useEffect(() => { setPage(1); }, [ordering]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Devis</h1>
        <Link
          to="/quotes/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
        >
          <Plus size={18} /> Nouveau devis
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Tous les statuts</option>
          <option value="DRAFT">Brouillon</option>
          <option value="SENT">Envoye</option>
          <option value="ACCEPTED">Accepte</option>
          <option value="REFUSED">Refuse</option>
          <option value="EXPIRED">Expire</option>
          <option value="CONVERTED">Converti</option>
        </select>
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
                <SortableHeader field="quote_number" label="N° Devis" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cree par</th>
                <SortableHeader field="status" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="total" label="Total" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="valid_until" label="Validite" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="created_at" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
              </tr>
            </thead>
            <tbody>
              {data?.results.map((quote) => (
                <tr key={quote.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/quotes/${quote.id}`} className="text-primary hover:underline">
                      {quote.quote_number || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{quote.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{quote.created_by_name ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge type="quote" value={quote.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(quote.total)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {quote.valid_until ? (
                      <span className={quote.is_expired ? 'text-red-600' : ''}>
                        {new Date(quote.valid_until).toLocaleDateString('fr-FR')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(quote.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Aucun devis trouve.
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
