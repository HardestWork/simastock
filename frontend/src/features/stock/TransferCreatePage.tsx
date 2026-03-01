/** Form to create a new stock transfer. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2, Package } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type { ProductStock } from '@/api/types';

interface TransferLine {
  id: string; // local unique id for React key
  product_id: string;
  product_name: string;
  quantity: number;
  searchTerm: string;
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

export default function TransferCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);
  const { stores } = useAuthStore();

  const [toStoreId, setToStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [error, setError] = useState('');
  const [activeSearchLine, setActiveSearchLine] = useState<string | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  // Destination stores: exclude currentStore
  const destinationStores = stores.filter((s) => s.id !== currentStore?.id);

  // Search products query â€” only run when there's an active search line with a search term
  const activeSearch = activeSearchLine ? (searchTerms[activeSearchLine] ?? '') : '';
  const productSearchParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page_size: '10',
  };
  if (activeSearch) productSearchParams.search = activeSearch;

  const { data: productSearchData } = useQuery({
    queryKey: queryKeys.stockLevels.list(productSearchParams),
    queryFn: () => stockApi.levels(productSearchParams),
    enabled: !!currentStore && !!activeSearch,
  });

  const { mutate: createTransfer, isPending } = useMutation({
    mutationFn: (data: {
      from_store_id: string;
      to_store: string;
      notes?: string;
      lines: { product_id: string; quantity: number }[];
    }) => stockApi.createTransfer(data),
    onSuccess: (response) => {
      toast.success(`Transfert cree: #${response.id.substring(0, 8).toUpperCase()}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      navigate(`/stock/transfers/${response.id}`);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setError('Une erreur est survenue lors de la creation du transfert.');
    },
  });

  function addLine() {
    const newId = generateId();
    setLines((prev) => [
      ...prev,
      { id: newId, product_id: '', product_name: '', quantity: 1, searchTerm: '' },
    ]);
    setSearchTerms((prev) => ({ ...prev, [newId]: '' }));
    setActiveSearchLine(newId);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSearchTerms((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeSearchLine === id) setActiveSearchLine(null);
  }

  function updateLineQuantity(id: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, qty) } : l))
    );
  }

  function selectProduct(lineId: string, stock: ProductStock) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, product_id: stock.product, product_name: stock.product_name, searchTerm: stock.product_name }
          : l
      )
    );
    setSearchTerms((prev) => ({ ...prev, [lineId]: stock.product_name }));
    setActiveSearchLine(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!currentStore) {
      setError('Aucun magasin selectionne.');
      return;
    }
    if (!toStoreId) {
      setError('Veuillez selectionner un magasin de destination.');
      return;
    }
    if (lines.length === 0) {
      setError('Veuillez ajouter au moins un produit.');
      return;
    }
    const invalidLine = lines.find((l) => !l.product_id);
    if (invalidLine) {
      setError('Veuillez selectionner un produit pour chaque ligne.');
      return;
    }

    createTransfer({
      from_store_id: currentStore.id,
      to_store: toStoreId,
      notes: notes || undefined,
      lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/stock/transfers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
        >
          <ChevronLeft size={14} />
          Retour aux transferts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nouveau transfert</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Transfer info */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Informations du transfert</h2>

          {/* Source store (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              {currentStore?.name ?? '-'}
            </div>
          </div>

          {/* Destination store */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Magasin de destination <span className="text-red-500">*</span>
            </label>
            <select
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Selectionner un magasin...</option>
              {destinationStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            {destinationStores.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Aucun autre magasin disponible.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes <span className="text-gray-400 dark:text-gray-500">(optionnel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes sur ce transfert..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Product lines */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Produits</h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Plus size={15} />
              Ajouter un produit
            </button>
          </div>

          {lines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
              <Package size={36} className="mb-2 opacity-40" />
              <p className="text-sm">Aucun produit ajoute.</p>
              <p className="text-xs">Cliquez sur "Ajouter un produit" pour commencer.</p>
            </div>
          )}

          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.id} className="relative flex gap-2 items-start">
                {/* Product search */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchTerms[line.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchTerms((prev) => ({ ...prev, [line.id]: val }));
                      setActiveSearchLine(line.id);
                      // Clear selection if user types again
                      if (line.product_id && val !== line.product_name) {
                        setLines((prev) =>
                          prev.map((l) =>
                            l.id === line.id ? { ...l, product_id: '', product_name: '' } : l
                          )
                        );
                      }
                    }}
                    onFocus={() => setActiveSearchLine(line.id)}
                    placeholder="Rechercher un produit..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                  />
                  {/* Search dropdown */}
                  {activeSearchLine === line.id &&
                    activeSearch &&
                    productSearchData &&
                    productSearchData.results.length > 0 && (
                      <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {productSearchData.results.map((stock) => (
                          <button
                            key={stock.id}
                            type="button"
                            onMouseDown={() => selectProduct(line.id, stock)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm"
                          >
                            <div className="font-medium">{stock.product_name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              SKU: {stock.product_sku} â€” Disponible: {stock.available_qty}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {/* Quantity */}
                <div className="w-24">
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLineQuantity(line.id, parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-center dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Qte"
                  />
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Link
            to="/stock/transfers"
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Creation...' : 'Creer le transfert'}
          </button>
        </div>
      </form>
    </div>
  );
}

