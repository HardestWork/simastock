/** Stock adjustment page â€” bulk ADJUST movements (positive or negative) for the current store. */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Minus, X, SlidersHorizontal, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type { ProductStock } from '@/api/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdjustLine {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StockAdjustPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  // Search state with debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Adjustment lines state
  const [lines, setLines] = useState<AdjustLine[]>([]);

  // Reason is REQUIRED for adjustments
  const [reason, setReason] = useState('');

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const searchParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page_size: '10',
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  };

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: queryKeys.stockLevels.list(searchParams),
    queryFn: () => stockApi.levels(searchParams),
    enabled: !!currentStore,
  });

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  const mutation = useMutation({
    mutationFn: (payload: {
      store_id: string;
      adjustments: { product_id: string; quantity: number }[];
      reason: string;
    }) => stockApi.bulkAdjust(payload),
    onSuccess: (response) => {
      toast.info(
        `Ajustement enregistre: ${lines.length} produit(s), variation totale ${totalAdjustment > 0 ? '+' : ''}${totalAdjustment}.`,
      );
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
          quantity: 0,
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
        l.product_id === productId ? { ...l, quantity: isNaN(value) ? 0 : value } : l
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
        l.product_id === productId ? { ...l, quantity: l.quantity - 1 } : l
      )
    );
  };

  const handleSubmit = () => {
    if (!currentStore || lines.length === 0 || !reason.trim() || hasInvalidLines) return;
    mutation.mutate({
      store_id: currentStore.id,
      adjustments: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      reason: reason.trim(),
    });
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const totalProducts = lines.length;
  const totalAdjustment = lines.reduce((sum, l) => sum + l.quantity, 0);

  // A line is invalid if its predicted new stock would be negative
  const hasInvalidLines = lines.some((l) => l.current_stock + l.quantity < 0);

  const canSubmit =
    lines.length > 0 &&
    reason.trim().length > 0 &&
    !hasInvalidLines &&
    !mutation.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 h-full">
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ajustement de stock</h1>
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

        {/* ------------------------------------------------------------------ */}
        {/* Left column â€” Product search                                        */}
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
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-260px)]">
            {searchLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            )}

            {!searchLoading && searchData?.results.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Aucun produit trouve.</p>
            )}

            {!searchLoading &&
              searchData?.results.map((stock) => {
                const alreadyAdded = lines.some((l) => l.product_id === stock.product);
                return (
                  <button
                    key={stock.id}
                    onClick={() => handleAddProduct(stock)}
                    disabled={alreadyAdded}
                    className={`text-left w-full p-3 rounded-lg border transition-colors ${
                      alreadyAdded
                        ? 'border-blue-200 bg-blue-50 cursor-default opacity-60'
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
                      <p className="text-xs text-blue-600 mt-1">Deja ajoute</p>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Middle column â€” Adjustment lines                                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Lignes d'ajustement
            {totalProducts > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({totalProducts} produit{totalProducts > 1 ? 's' : ''})
              </span>
            )}
          </h2>

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-260px)]">
            {lines.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <SlidersHorizontal size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Selectionnez des produits depuis la recherche pour commencer.
                </p>
              </div>
            )}

            {lines.map((line) => {
              const newStock = line.current_stock + line.quantity;
              const isNegativeResult = newStock < 0;
              const isEntry = line.quantity > 0;
              const isSortie = line.quantity < 0;

              return (
                <div
                  key={line.product_id}
                  className={`bg-white dark:bg-gray-800 border rounded-lg p-3 flex flex-col gap-2 ${
                    isNegativeResult ? 'border-red-300' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Product info + direction badge + remove */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.product_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{line.product_sku}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Direction indicator */}
                      {isEntry && (
                        <span className="flex items-center gap-0.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                          <TrendingUp size={10} />
                          Entree (+)
                        </span>
                      )}
                      {isSortie && (
                        <span className="flex items-center gap-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                          <TrendingDown size={10} />
                          Sortie (-)
                        </span>
                      )}
                      {line.quantity === 0 && (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 rounded">
                          Neutre
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveLine(line.product_id)}
                        className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Retirer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Stock info + quantity control */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-3">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Stock actuel</p>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{line.current_stock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Nouveau stock</p>
                        <p
                          className={`text-sm font-semibold ${
                            isNegativeResult ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {newStock}
                        </p>
                      </div>
                    </div>

                    {/* Quantity control â€” allows negatives */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(line.product_id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          handleQuantityChange(line.product_id, parseInt(e.target.value))
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

                  {/* Invalid line warning */}
                  {isNegativeResult && (
                    <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                      Stock insuffisant : le nouveau stock ne peut pas etre negatif.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right column â€” Summary & Submit                                     */}
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
              <span className="text-gray-600 dark:text-gray-400">Ajustement total</span>
              <span
                className={`font-semibold ${
                  totalAdjustment > 0
                    ? 'text-green-600'
                    : totalAdjustment < 0
                    ? 'text-red-600'
                    : 'text-gray-900 dark:text-gray-100'
                }`}
              >
                {totalAdjustment > 0 ? `+${totalAdjustment}` : totalAdjustment}
              </span>
            </div>
            {hasInvalidLines && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <p className="text-xs text-red-600 font-medium">
                  Certaines lignes resulteraient en un stock negatif.
                </p>
              </div>
            )}
          </div>

          {/* Reason textarea â€” REQUIRED */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Motif <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Ex: Correction apres inventaire, produits endommages, vol..."
              className={`w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-gray-700 dark:text-gray-100 ${
                reason.trim().length === 0 && lines.length > 0
                  ? 'border-red-300'
                  : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            {reason.trim().length === 0 && lines.length > 0 && (
              <p className="text-xs text-red-500">Le motif est obligatoire pour un ajustement.</p>
            )}
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
                <SlidersHorizontal size={16} />
                <span>Valider l'ajustement</span>
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

