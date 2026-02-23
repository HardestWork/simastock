/** Purchase order form page -- create or edit a draft purchase order. */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierApi, purchaseOrderApi, productApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import type { Product } from '@/api/types';
import type { AxiosError } from 'axios';
import {
  Plus,
  Trash2,
  Save,
  Send,
  ArrowLeft,
  Search,
  Package,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LineDraft {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity_ordered: number;
  unit_cost: number;
}

function extractErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<{ detail?: string; non_field_errors?: string[] }>;
  return (
    axErr?.response?.data?.detail ??
    axErr?.response?.data?.non_field_errors?.[0] ??
    (err as Error)?.message ??
    'Une erreur est survenue.'
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PurchaseFormPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const currentStore = useStoreStore((s) => s.currentStore);

  // -----------------------------------------------------------------------
  // Form state
  // -----------------------------------------------------------------------
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Edit mode: load existing PO
  // -----------------------------------------------------------------------
  const { data: existingPO, isLoading: isLoadingPO } = useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id!),
    queryFn: () => purchaseOrderApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (existingPO) {
      // If not DRAFT, redirect to detail page
      if (existingPO.status !== 'DRAFT') {
        navigate(`/purchases/orders/${existingPO.id}`, { replace: true });
        return;
      }
      setSupplierId(existingPO.supplier);
      setNotes(existingPO.notes || '');
      setLines(
        existingPO.lines.map((l) => ({
          product_id: l.product,
          product_name: l.product_name,
          product_sku: l.product_sku,
          quantity_ordered: l.quantity_ordered,
          unit_cost: parseFloat(l.unit_cost),
        })),
      );
    }
  }, [existingPO, navigate]);

  // -----------------------------------------------------------------------
  // Suppliers query
  // -----------------------------------------------------------------------
  const { data: suppliersData } = useQuery({
    queryKey: queryKeys.suppliers.list({ is_active: 'true', page_size: '200' }),
    queryFn: () => supplierApi.list({ is_active: 'true', page_size: '200' }),
  });

  const suppliers = suppliersData?.results ?? [];

  // -----------------------------------------------------------------------
  // Product search query (debounced)
  // -----------------------------------------------------------------------
  const debouncedProductSearch = useDebounce(productSearch, 300);

  const { data: productResults, isLoading: isProductsLoading } = useQuery({
    queryKey: queryKeys.products.list({ search: debouncedProductSearch, page_size: '10' }),
    queryFn: () => productApi.list({ search: debouncedProductSearch, page_size: '10' }),
    enabled: debouncedProductSearch.length >= 2,
  });

  // Close product dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------
  const createMut = useMutation({
    mutationFn: (submitNow: boolean) =>
      purchaseOrderApi.create({
        store: currentStore!.id,
        supplier: supplierId,
        notes: notes || undefined,
        submit_now: submitNow,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity_ordered: l.quantity_ordered,
          unit_cost: l.unit_cost.toString(),
        })),
      }),
    onSuccess: (data) => {
      toast.success(`Bon de commande cree : ${data.po_number}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      navigate(`/purchases/orders/${data.id}`);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      purchaseOrderApi.update(id!, {
        supplier: supplierId,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity_ordered: l.quantity_ordered,
          unit_cost: l.unit_cost.toString(),
        })),
      }),
    onSuccess: (data) => {
      toast.success(`Bon de commande mis a jour : ${data.po_number}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id!) });
      navigate(`/purchases/orders/${data.id}`);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
    },
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  function handleAddProduct(product: Product) {
    // Check if product already exists in lines
    const existingIndex = lines.findIndex((l) => l.product_id === product.id);
    if (existingIndex >= 0) {
      // Increment quantity
      setLines((prev) =>
        prev.map((l, i) =>
          i === existingIndex
            ? { ...l, quantity_ordered: l.quantity_ordered + 1 }
            : l,
        ),
      );
    } else {
      setLines((prev) => [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku,
          quantity_ordered: 1,
          unit_cost: parseFloat(product.cost_price) || 0,
        },
      ]);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  }

  function handleRemoveLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleQuantityChange(index: number, value: number) {
    if (value < 1) return;
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity_ordered: value } : l)),
    );
  }

  function handleUnitCostChange(index: number, value: number) {
    if (value < 0) return;
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, unit_cost: value } : l)),
    );
  }

  function handleSaveDraft() {
    if (isEditMode) {
      updateMut.mutate();
    } else {
      createMut.mutate(false);
    }
  }

  function handleSaveAndSubmit() {
    createMut.mutate(true);
  }

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------
  const subtotal = lines.reduce(
    (sum, l) => sum + l.quantity_ordered * l.unit_cost,
    0,
  );

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = supplierId !== '' && lines.length > 0 && !isSaving;

  // -----------------------------------------------------------------------
  // Guards
  // -----------------------------------------------------------------------
  if (!currentStore) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Aucun magasin selectionne.
      </div>
    );
  }

  if (isEditMode && isLoadingPO) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isEditMode && existingPO && existingPO.status !== 'DRAFT') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Seuls les bons de commande en brouillon peuvent etre modifies.
        </p>
        <Link
          to={`/purchases/orders/${id}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
        >
          <ArrowLeft size={14} /> Retour au bon de commande
        </Link>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to="/purchases/orders"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
          >
            <ArrowLeft size={14} /> Retour aux bons de commande
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isEditMode
              ? `Modifier ${existingPO?.po_number ?? 'BC'}`
              : 'Nouveau bon de commande'}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column -- Supplier + Lines */}
        <div className="lg:col-span-2 space-y-4">
          {/* Supplier selector */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fournisseur <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">-- Selectionner un fournisseur --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Product search + Lines */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ajouter un produit
            </label>

            {/* Search input */}
            <div className="relative" ref={productSearchRef}>
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => {
                  if (debouncedProductSearch.length >= 2) {
                    setShowProductDropdown(true);
                  }
                }}
                placeholder="Rechercher par nom ou SKU..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />

              {/* Product search dropdown */}
              {showProductDropdown && debouncedProductSearch.length >= 2 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {isProductsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 px-4 py-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                      Recherche...
                    </div>
                  ) : productResults && productResults.results.length > 0 ? (
                    productResults.results.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      >
                        <Plus size={16} className="text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3">
                            <span>SKU: {p.sku}</span>
                            <span>Cout: {formatCurrency(p.cost_price)}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      Aucun produit trouve.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Lines table */}
            {lines.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Produit
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600 dark:text-gray-400 w-28">
                        Quantite
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600 dark:text-gray-400 w-36">
                        Cout unitaire
                      </th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600 dark:text-gray-400 w-32">
                        Total
                      </th>
                      <th className="px-3 py-2.5 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const lineTotal = line.quantity_ordered * line.unit_cost;
                      return (
                        <tr
                          key={`${line.product_id}-${index}`}
                          className="border-b border-gray-100 dark:border-gray-700"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {line.product_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {line.product_sku}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min={1}
                              value={line.quantity_ordered}
                              onChange={(e) =>
                                handleQuantityChange(index, parseInt(e.target.value, 10) || 1)
                              }
                              className="w-full text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.unit_cost}
                              onChange={(e) =>
                                handleUnitCostChange(index, parseFloat(e.target.value) || 0)
                              }
                              className="w-full text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => handleRemoveLine(index)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Retirer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                <Package size={40} className="mb-2 opacity-50" />
                <p className="text-sm">Aucun produit ajoute.</p>
                <p className="text-xs mt-1">
                  Recherchez un produit ci-dessus pour l'ajouter au bon de commande.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column -- Notes + Summary + Actions */}
        <div className="space-y-4">
          {/* Notes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes internes sur cette commande..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Resume
            </h2>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Lignes</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {lines.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Quantite totale</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {lines.reduce((sum, l) => sum + l.quantity_ordered, 0)}
                </span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between text-base font-bold">
                <span className="text-gray-900 dark:text-gray-100">Sous-total</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={handleSaveDraft}
                disabled={!canSave}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {isSaving
                  ? 'Enregistrement...'
                  : isEditMode
                    ? 'Enregistrer les modifications'
                    : 'Enregistrer brouillon'}
              </button>

              {!isEditMode && (
                <button
                  onClick={handleSaveAndSubmit}
                  disabled={!canSave}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {createMut.isPending
                    ? 'Enregistrement...'
                    : 'Enregistrer et soumettre'}
                </button>
              )}

              <Link
                to="/purchases/orders"
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium"
              >
                <ArrowLeft size={16} />
                Annuler
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
