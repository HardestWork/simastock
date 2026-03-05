/** Stock entry page — bulk IN movements for the current store. */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Minus, X, PackagePlus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type { ProductStock } from '@/api/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntryLine {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  quantity: number;
  unit_cost: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StockEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  // Search state with debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchPage, setSearchPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when search changes
  useEffect(() => { setSearchPage(1); }, [debouncedSearch]);

  // Entry lines state
  const [lines, setLines] = useState<EntryLine[]>([]);

  // Summary form state
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const SEARCH_PAGE_SIZE = 10;

  const searchParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(searchPage),
    page_size: String(SEARCH_PAGE_SIZE),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  };

  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useQuery({
    queryKey: queryKeys.stockLevels.list(searchParams),
    queryFn: () => stockApi.levels(searchParams),
    enabled: !!currentStore,
    placeholderData: keepPreviousData,
  });

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  const mutation = useMutation({
    mutationFn: (payload: {
      store_id: string;
      entries: { product_id: string; quantity: number; unit_cost?: string | null }[];
      reference?: string;
      reason?: string;
    }) => stockApi.bulkEntry(payload),
    onSuccess: (response) => {
      toast.success(`Entree de stock enregistree: ${lines.length} produit(s), ${totalQuantity} unite(s).`);
      queryClient.invalidateQueries({ queryKey: queryKeys.stockLevels.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.all });
      navigate(`/stock/movements/${response.batch_id}`);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddProduct = (stock: ProductStock) => {
    setLines((prev) => {
      if (prev.some((l) => l.product_id === stock.product)) return prev;
      return [
        ...prev,
        {
          product_id: stock.product,
          product_name: stock.product_name,
          product_sku: stock.product_sku,
          current_stock: stock.quantity,
          quantity: 1,
          unit_cost: stock.product_cost_price ?? '0',
        },
      ];
    });
  };

  const handleRemoveLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.product_id !== productId));
  };

  const handleQuantityChange = (productId: string, value: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product_id === productId ? { ...l, quantity: Math.max(1, value) } : l
      )
    );
  };

  const handleIncrement = (productId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product_id === productId ? { ...l, quantity: l.quantity + 1 } : l
      )
    );
  };

  const handleDecrement = (productId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product_id === productId
          ? { ...l, quantity: Math.max(1, l.quantity - 1) }
          : l
      )
    );
  };

  const handleUnitCostChange = (productId: string, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, unit_cost: value } : l))
    );
  };

  const handleSubmit = () => {
    if (!currentStore || lines.length === 0) return;
    mutation.mutate({
      store_id: currentStore.id,
      entries: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost && parseFloat(l.unit_cost) > 0 ? l.unit_cost : null,
      })),
      reference: reference.trim() || undefined,
      reason: reason.trim() || undefined,
    });
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const totalProducts = lines.length;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const canSubmit = lines.length > 0 && !mutation.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/stock"
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Stock</span>
        </Link>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Entree de stock</h1>
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">

        {/* ------------------------------------------------------------------ */}
        {/* Left column — Product search                                        */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Rechercher un produit</h2>

          {/* Search input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-2 lg:overflow-y-auto lg:max-h-[calc(100vh-320px)]">
            {searchLoading && !searchData && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            )}

            {searchFetching && searchData && (
              <div className="h-1 bg-primary/20 rounded overflow-hidden">
                <div className="h-full bg-primary animate-pulse" />
              </div>
            )}

            {searchData?.results.length === 0 && !searchLoading && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Aucun produit trouve.</p>
            )}

            {searchData?.results.map((stock) => {
                const alreadyAdded = lines.some((l) => l.product_id === stock.product);
                return (
                  <button
                    key={stock.id}
                    onClick={() => handleAddProduct(stock)}
                    disabled={alreadyAdded}
                    className={`text-left w-full p-3 rounded-lg border transition-colors ${
                      alreadyAdded
                        ? 'border-green-200 bg-green-50 cursor-default opacity-60'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary hover:bg-primary/5 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {stock.product_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{stock.product_sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Stock actuel</p>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{stock.quantity}</p>
                      </div>
                    </div>
                    {alreadyAdded && (
                      <p className="text-xs text-green-600 mt-1">Deja ajoute</p>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Pagination for search results */}
          {searchData && searchData.count > SEARCH_PAGE_SIZE && (
            <div className={'flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700'}>
              <span className={'text-xs text-gray-500 dark:text-gray-400'}>
                {(searchPage - 1) * SEARCH_PAGE_SIZE + 1}-{Math.min(searchPage * SEARCH_PAGE_SIZE, searchData.count)} / {searchData.count}
              </span>
              <div className={'flex items-center gap-1'}>
                <button
                  onClick={() => setSearchPage((p) => p - 1)}
                  disabled={searchPage <= 1}
                  className={'p-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className={'text-xs text-gray-600 dark:text-gray-400 px-1'}>
                  {searchPage} / {Math.ceil(searchData.count / SEARCH_PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setSearchPage((p) => p + 1)}
                  disabled={searchPage >= Math.ceil(searchData.count / SEARCH_PAGE_SIZE)}
                  className={'p-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Middle column — Entry lines                                         */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Lignes d'entree
            {totalProducts > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({totalProducts} produit{totalProducts > 1 ? 's' : ''})
              </span>
            )}
          </h2>

          <div className="flex flex-col gap-2 lg:overflow-y-auto lg:max-h-[calc(100vh-260px)]">
            {lines.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PackagePlus size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Selectionnez des produits depuis la recherche pour commencer.
                </p>
              </div>
            )}

            {lines.map((line) => (
              <div
                key={line.product_id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-2"
              >
                {/* Product info + remove */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.product_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{line.product_sku}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveLine(line.product_id)}
                    className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                    title="Retirer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Price + Stock + Quantity */}
                <div className="flex flex-col gap-2">
                  {/* Unit cost input */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Prix achat</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.unit_cost}
                      onChange={(e) => handleUnitCostChange(line.product_id, e.target.value)}
                      className="flex-1 px-2 py-1 text-sm text-right border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">FCFA</span>
                  </div>

                  {/* Stock info + quantity control */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Stock actuel</p>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{line.current_stock}</p>
                    </div>

                    {/* Quantity control */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(line.product_id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          handleQuantityChange(line.product_id, parseInt(e.target.value) || 1)
                        }
                        className="w-16 text-center text-sm font-semibold border border-gray-200 dark:border-gray-600 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
                      />
                      <button
                        onClick={() => handleIncrement(line.product_id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right column — Summary & Submit                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Recapitulatif</h2>

          {/* Summary card */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">Nombre de produits</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{totalProducts}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">Quantite totale</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{totalQuantity}</span>
            </div>
          </div>

          {/* Reference input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Reference <span className="text-gray-400 dark:text-gray-500 font-normal">(optionnel)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex: BL-2024-001"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Reason textarea */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Motif <span className="text-gray-400 dark:text-gray-500 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex: Livraison fournisseur, reapprovisionnement..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Error */}
          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-sm text-red-600">
                Une erreur est survenue. Veuillez reessayer.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Validation en cours...</span>
              </>
            ) : (
              <>
                <PackagePlus size={16} />
                <span>Valider les entrees</span>
              </>
            )}
          </button>

          {lines.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              Ajoutez au moins un produit pour valider.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

