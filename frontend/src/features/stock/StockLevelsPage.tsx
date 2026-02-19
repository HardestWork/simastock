/** Stock levels page — shows stock per product in current store. */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Package,
  ArrowLeftRight,
  ClipboardList,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';

const PAGE_SIZE = 25;

export default function StockLevelsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('product__name', 'asc');

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (debouncedSearch) params.search = debouncedSearch;
  if (ordering) params.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stockLevels.list(params),
    queryFn: () => stockApi.levels(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  useEffect(() => { setPage(1); }, [ordering]);

  function getStockStatus(available: number, min: number) {
    if (available === 0) return 'rupture';
    if (available <= min) return 'faible';
    return 'ok';
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={24} />
          Niveaux de stock
        </h1>

        {/* Navigation buttons */}
        <nav className="flex flex-wrap gap-2 print:hidden">
          <Link
            to="/stock/movements"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeftRight size={15} />
            Mouvements
          </Link>
          <Link
            to="/stock/entry"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowDownToLine size={15} />
            Entree stock
          </Link>
          <Link
            to="/stock/adjust"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowUpFromLine size={15} />
            Ajustement
          </Link>
          <Link
            to="/stock/transfers"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeftRight size={15} />
            Transferts
          </Link>
          <Link
            to="/stock/counts"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ClipboardList size={15} />
            Inventaire
          </Link>
        </nav>
      </div>

      {/* Search bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher un produit..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
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
                <SortableHeader field="product__name" label="Produit" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="quantity" label="Quantite" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="reserved_qty" label="Reservee" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <th className="text-right px-4 py-3 font-medium text-gray-600">Disponible</th>
                <SortableHeader field="min_qty" label="Seuil min" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((stock) => {
                const status = getStockStatus(stock.available_qty, stock.min_qty);
                return (
                  <tr key={stock.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{stock.product_name}</div>
                      <div className="text-xs text-gray-500">{stock.product_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{stock.quantity}</td>
                    <td className="px-4 py-3 text-right">{stock.reserved_qty}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        status === 'rupture'
                          ? 'text-red-600'
                          : status === 'faible'
                          ? 'text-orange-500'
                          : 'text-green-600'
                      }`}
                    >
                      {stock.available_qty}
                    </td>
                    <td className="px-4 py-3 text-right">{stock.min_qty}</td>
                    <td className="px-4 py-3 text-center">
                      {status === 'rupture' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Rupture
                        </span>
                      )}
                      {status === 'faible' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          Faible
                        </span>
                      )}
                      {status === 'ok' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucun stock enregistre.
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
