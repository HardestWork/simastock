/** Inventory movement list page — paginated list of all stock movements. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Search, Filter } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import type { MovementType } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';

const PAGE_SIZE = 25;

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  IN: 'Entree',
  OUT: 'Sortie',
  ADJUST: 'Ajustement',
  DAMAGE: 'Dommage',
  TRANSFER_IN: 'Transfert entrant',
  TRANSFER_OUT: 'Transfert sortant',
  RETURN: 'Retour',
  SALE: 'Vente',
  PURCHASE: 'Achat',
};

const MOVEMENT_TYPE_COLORS: Record<MovementType, string> = {
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-red-100 text-red-700',
  ADJUST: 'bg-blue-100 text-blue-700',
  DAMAGE: 'bg-orange-100 text-orange-700',
  TRANSFER_IN: 'bg-purple-100 text-purple-700',
  TRANSFER_OUT: 'bg-purple-100 text-purple-700',
  RETURN: 'bg-yellow-100 text-yellow-700',
  SALE: 'bg-red-100 text-red-700',
  PURCHASE: 'bg-green-100 text-green-700',
};

const ALL_MOVEMENT_TYPES: MovementType[] = [
  'IN',
  'OUT',
  'ADJUST',
  'DAMAGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN',
  'SALE',
  'PURCHASE',
];

/** Returns true for movement types that increase stock (positive qty). */
function isPositiveMovement(type: MovementType): boolean {
  return ['IN', 'TRANSFER_IN', 'RETURN', 'PURCHASE', 'ADJUST'].includes(type);
}

export default function MovementListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState<MovementType | ''>('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('created_at', 'desc');

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (movementType) params.movement_type = movementType;
  if (debouncedSearch) params.search = debouncedSearch;
  if (ordering) params.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stockMovements.list(params),
    queryFn: () => stockApi.movements(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  useEffect(() => { setPage(1); }, [ordering]);

  function handleTypeChange(value: string) {
    setMovementType(value as MovementType | '');
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/stock"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={15} />
          Stock
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Mouvements de stock</h1>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher par produit ou reference..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>

        {/* Movement type filter */}
        <div className="relative flex items-center gap-2">
          <Filter size={16} className="text-gray-400 shrink-0" />
          <select
            value={movementType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="py-2 pl-3 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white appearance-none cursor-pointer"
          >
            <option value="">Tous les types</option>
            {ALL_MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
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
                <SortableHeader field="product__name" label="Produit" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="movement_type" label="Type" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="quantity" label="Quantite" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Motif</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acteur</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((movement) => {
                const positive = isPositiveMovement(movement.movement_type);
                const qtyPrefix = positive ? '+' : '-';
                const absQty = Math.abs(movement.quantity);
                const dateFormatted = format(
                  new Date(movement.created_at),
                  'dd/MM/yyyy HH:mm',
                );

                return (
                  <tr
                    key={movement.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    {/* Date — link to document if batch_id exists */}
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {movement.batch_id ? (
                        <Link
                          to={`/stock/movements/${movement.batch_id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {dateFormatted}
                        </Link>
                      ) : (
                        <span>{dateFormatted}</span>
                      )}
                    </td>

                    {/* Product */}
                    <td className="px-4 py-3 font-medium">{movement.product_name}</td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          MOVEMENT_TYPE_COLORS[movement.movement_type]
                        }`}
                      >
                        {MOVEMENT_TYPE_LABELS[movement.movement_type]}
                      </span>
                    </td>

                    {/* Quantity with color coding */}
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        positive ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {qtyPrefix}{absQty}
                    </td>

                    {/* Reference */}
                    <td className="px-4 py-3 text-gray-600">
                      {movement.reference || '—'}
                    </td>

                    {/* Reason / Motif */}
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                      {movement.reason || '—'}
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3 text-gray-600">
                      {movement.actor_name || '—'}
                    </td>
                  </tr>
                );
              })}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Aucun mouvement enregistre.
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
