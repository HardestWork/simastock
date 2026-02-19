/** Stock entry page — bulk IN movements for the current store. */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Minus, X, PackagePlus, Search } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Entry lines state
  const [lines, setLines] = useState<EntryLine[]>([]);

  // Summary form state
  const [reference, setReference] = useState('');
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
      entries: { product_id: string; quantity: number }[];
      reference?: string;
      reason?: string;
    }) => stockApi.bulkEntry(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stockLevels.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.all });
      navigate(`/stock/movements/${response.batch_id}`);
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

  const handleSubmit = () => {
    if (!currentStore || lines.length === 0) return;
    mutation.mutate({
      store_id: currentStore.id,
      entries: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
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
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/stock"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Stock</span>
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Entree de stock</h1>
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

        {/* ------------------------------------------------------------------ */}
        {/* Left column — Product search                                        */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-800">Rechercher un produit</h2>

          {/* Search input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
              <p className="text-sm text-gray-500 text-center py-6">Aucun produit trouve.</p>
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
                        ? 'border-green-200 bg-green-50 cursor-default opacity-60'
                        : 'border-gray-200 bg-white hover:border-primary hover:bg-primary/5 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {stock.product_name}
                        </p>
                        <p className="text-xs text-gray-500">{stock.product_sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">Stock actuel</p>
                        <p className="text-sm font-semibold text-gray-700">{stock.quantity}</p>
                      </div>
                    </div>
                    {alreadyAdded && (
                      <p className="text-xs text-green-600 mt-1">Deja ajoute</p>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Middle column — Entry lines                                         */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-800">
            Lignes d'entree
            {totalProducts > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({totalProducts} produit{totalProducts > 1 ? 's' : ''})
              </span>
            )}
          </h2>

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-260px)]">
            {lines.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PackagePlus size={36} className="text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">
                  Selectionnez des produits depuis la recherche pour commencer.
                </p>
              </div>
            )}

            {lines.map((line) => (
              <div
                key={line.product_id}
                className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2"
              >
                {/* Product info + remove */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{line.product_name}</p>
                    <p className="text-xs text-gray-500">{line.product_sku}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveLine(line.product_id)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    title="Retirer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Stock info + quantity control */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Stock actuel</p>
                    <p className="text-sm font-semibold text-gray-700">{line.current_stock}</p>
                  </div>

                  {/* Quantity control */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDecrement(line.product_id)}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
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
                      className="w-16 text-center text-sm font-semibold border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      onClick={() => handleIncrement(line.product_id)}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <Plus size={12} />
                    </button>
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
          <h2 className="text-base font-semibold text-gray-800">Recapitulatif</h2>

          {/* Summary card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Nombre de produits</span>
              <span className="font-semibold text-gray-900">{totalProducts}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Quantite totale</span>
              <span className="font-semibold text-gray-900">{totalQuantity}</span>
            </div>
          </div>

          {/* Reference input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Reference <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex: BL-2024-001"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Reason textarea */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Motif <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex: Livraison fournisseur, reapprovisionnement..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
            <p className="text-xs text-gray-400 text-center">
              Ajoutez au moins un produit pour valider.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
