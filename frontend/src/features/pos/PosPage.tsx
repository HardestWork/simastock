/** POS (Point of Sale) page â€” create a new sale with product search and cart. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, saleApi, customerApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useCapabilities } from '@/lib/capabilities';
import { useDebounce } from '@/hooks/use-debounce';
import type { Sale, PosProduct } from '@/api/types';
import { Search, Plus, Minus, Trash2, Send, Banknote, UserPlus, Percent, X, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { AxiosError } from 'axios';

type DiscountMode = 'none' | 'percent' | 'fixed';

function extractErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<{ detail?: string; non_field_errors?: string[] }>;
  return (
    axErr?.response?.data?.detail ??
    axErr?.response?.data?.non_field_errors?.[0] ??
    (err as Error)?.message ??
    'Une erreur est survenue.'
  );
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentStore = useStoreStore((s) => s.currentStore);
  const capabilities = useCapabilities();
  const canCash = capabilities.includes('CAN_CASH');

  const [sale, setSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isChangingCustomer, setIsChangingCustomer] = useState(false);

  // Discount state
  const [discountMode, setDiscountMode] = useState<DiscountMode>('none');
  const [discountValue, setDiscountValue] = useState('');

  // Inline customer creation state
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState('');
  const [newCustomerLastName, setNewCustomerLastName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // Products available in current store (with availability). Show a list even without search.
  const productParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page_size: '20',
    ordering: 'name',
  };
  if (debouncedSearch.trim().length >= 2) {
    productParams.search = debouncedSearch.trim();
  }
  const { data: products, isLoading: isProductsLoading, isError: isProductsError, error: productsError } = useQuery({
    queryKey: ['pos', 'products', productParams],
    queryFn: () => productApi.available(productParams),
    enabled: !!currentStore,
  });

  // Customer search
  const { data: customers } = useQuery({
    queryKey: queryKeys.customers.list({ search: debouncedCustomerSearch }),
    queryFn: () => customerApi.list({ search: debouncedCustomerSearch }),
    enabled: debouncedCustomerSearch.length >= 2,
  });

  // Create sale mutation
  const createSaleMut = useMutation({
    mutationFn: (customerId?: string) =>
      saleApi.create({
        store_id: currentStore!.id,
        customer_id: customerId,
      }),
    onSuccess: (data) => { setActionError(null); setSale(data); },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Add item mutation (also used for incrementing quantity via +1)
  const addItemMut = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      saleApi.addItem(sale!.id, { product_id: productId, quantity }),
    onSuccess: (data) => { setActionError(null); setSale(data); },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Remove item mutation
  const removeItemMut = useMutation({
    mutationFn: (itemId: string) => saleApi.removeItem(sale!.id, itemId),
    onSuccess: (data) => { setActionError(null); setSale(data); },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Update sale mutation (for discount & customer assignment)
  const updateSaleMut = useMutation({
    mutationFn: (data: Record<string, string>) => saleApi.update(sale!.id, data),
    onSuccess: (data) => { setActionError(null); setSale(data); },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Submit sale mutation
  const submitMut = useMutation({
    mutationFn: () => saleApi.submit(sale!.id),
    onSuccess: (submittedSale) => {
      toast.info(`Vente soumise: ${submittedSale.invoice_number ?? 'sans numero'}`);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setSale(null);
      setDiscountMode('none');
      setDiscountValue('');
    },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Submit & navigate to cashier (when user has CAN_SELL + CAN_CASH)
  const submitAndCashMut = useMutation({
    mutationFn: () => saleApi.submit(sale!.id),
    onSuccess: (submittedSale) => {
      toast.success(`Vente soumise pour encaissement: ${submittedSale.invoice_number ?? 'sans numero'}`);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      navigate(`/cashier/payment/${submittedSale.id}`);
    },
    onError: (err) => { toast.error(extractErrorMessage(err)); setActionError(extractErrorMessage(err)); },
  });

  // Create customer mutation
  const createCustomerMut = useMutation({
    mutationFn: () =>
      customerApi.create({
        first_name: newCustomerFirstName.trim(),
        last_name: newCustomerLastName.trim(),
        phone: newCustomerPhone.trim(),
      }),
    onSuccess: (newCustomer) => {
      toast.success(`Client cree: ${newCustomer.full_name}`);
      // Reset form
      setNewCustomerFirstName('');
      setNewCustomerLastName('');
      setNewCustomerPhone('');
      setShowNewCustomerForm(false);
      setCustomerSearch('');
      setIsChangingCustomer(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

      if (sale) {
        // Assign customer to existing sale
        updateSaleMut.mutate({ customer: newCustomer.id });
      } else {
        // Create sale with customer
        createSaleMut.mutate(newCustomer.id);
      }
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Erreur lors de la creation du client');
    },
  });

  function handleSelectProduct(product: PosProduct) {
    setActionError(null);
    if (!sale) {
      // Create sale first, then add item
      createSaleMut.mutate(undefined, {
        onSuccess: (newSale) => {
          setSale(newSale);
          saleApi.addItem(newSale.id, { product_id: product.id, quantity: 1 })
            .then((updated) => setSale(updated))
            .catch((err) => setActionError(extractErrorMessage(err)));
        },
      });
    } else {
      addItemMut.mutate({ productId: product.id, quantity: 1 });
    }
    setSearch('');
  }

  function handleAddOneMore(productId: string) {
    if (!sale) return;
    addItemMut.mutate({ productId, quantity: 1 });
  }

  function handleSelectCustomer(customerId: string) {
    if (!sale) {
      createSaleMut.mutate(customerId);
    } else {
      // Assign customer to existing draft sale
      updateSaleMut.mutate({ customer: customerId });
    }
    setCustomerSearch('');
    setIsChangingCustomer(false);
  }

  function handleDiscountModeChange(mode: DiscountMode) {
    setDiscountMode(mode);
    setDiscountValue('');
    if (mode === 'none' && sale) {
      updateSaleMut.mutate({ discount_percent: '0' });
    }
  }

  function handleDiscountApply() {
    if (!sale || !discountValue) return;
    if (discountMode === 'percent') {
      const val = Math.min(100, Math.max(0, parseFloat(discountValue) || 0));
      updateSaleMut.mutate({ discount_percent: val.toString() });
    }
    // For fixed amount discount, the backend uses discount_percent on the Sale model.
    // We calculate the equivalent percentage from the subtotal.
    if (discountMode === 'fixed') {
      const subtotal = parseFloat(sale.subtotal) || 0;
      if (subtotal > 0) {
        const fixedAmt = Math.min(subtotal, Math.max(0, parseFloat(discountValue) || 0));
        const pct = (fixedAmt / subtotal) * 100;
        updateSaleMut.mutate({ discount_percent: pct.toFixed(2) });
      }
    }
  }

  function handleCreateCustomerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerFirstName.trim() || !newCustomerLastName.trim() || !newCustomerPhone.trim()) return;
    createCustomerMut.mutate();
  }

  // Determine if customer search yielded no results
  const noCustomerResults =
    debouncedCustomerSearch.length >= 2 &&
    customers !== undefined &&
    customers.results.length === 0;

  const showCustomerSearch = !sale?.customer || !!sale?.customer_is_default || isChangingCustomer;

  if (!currentStore) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucun magasin selectionne.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Nouvelle vente</h1>

      {/* Global error banner */}
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{actionError}</p>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left â€” Product Search */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer search */}
          {showCustomerSearch && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client</label>
                {isChangingCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingCustomer(false);
                      setCustomerSearch('');
                      setShowNewCustomerForm(false);
                    }}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Annuler
                  </button>
                )}
              </div>
              {sale?.customer_is_default && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Client comptant par defaut. Selectionnez un client si necessaire.</p>
              )}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowNewCustomerForm(false);
                  }}
                  placeholder="Rechercher un client..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              {customers && customers.results.length > 0 && customerSearch && (
                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                  {customers.results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c.id)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      {c.full_name} â€” {c.phone}
                    </button>
                  ))}
                </div>
              )}

              {/* No results â€” offer to create a new customer */}
              {noCustomerResults && !showNewCustomerForm && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Aucun client trouve.</span>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
                  >
                    <UserPlus size={14} />
                    Creer un client
                  </button>
                </div>
              )}

              {/* Inline customer creation form */}
              {showNewCustomerForm && (
                <form onSubmit={handleCreateCustomerSubmit} className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nouveau client</span>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomerForm(false)}
                      className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newCustomerFirstName}
                      onChange={(e) => setNewCustomerFirstName(e.target.value)}
                      placeholder="Prenom *"
                      required
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      value={newCustomerLastName}
                      onChange={(e) => setNewCustomerLastName(e.target.value)}
                      placeholder="Nom *"
                      required
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Telephone *"
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={createCustomerMut.isPending}
                    className="w-full py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
                  >
                    {createCustomerMut.isPending ? 'Creation...' : 'Creer et selectionner'}
                  </button>
                  {createCustomerMut.isError && (
                    <p className="text-xs text-red-600">
                      Erreur: {((createCustomerMut.error as AxiosError)?.response?.data as any)?.detail ?? 'Impossible de creer le client.'}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Selected customer summary */}
          {sale?.customer && !sale?.customer_is_default && !showCustomerSearch && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Client</span>
                <button
                  type="button"
                  onClick={() => setIsChangingCustomer(true)}
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                >
                  Changer
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{sale.customer_name || 'Client selectionne'}</p>
            </div>
          )}

          {/* Product search */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ajouter un produit</label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, SKU ou code-barres..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div className="mt-2">
              {isProductsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  Chargement des produits...
                </div>
              ) : isProductsError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  Erreur chargement produits: {((productsError as AxiosError)?.response?.data as any)?.detail ?? (productsError as Error).message}
                </div>
              ) : products && products.results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {products.results.map((p) => {
                    const isSelectable = !p.track_stock || (p.has_stock && p.available_qty > 0);
                    const stockLabel = p.track_stock
                      ? (p.has_stock ? `Stock: ${p.available_qty}` : 'Stock: --')
                      : 'Service';
                    const title = p.track_stock
                      ? (p.has_stock ? `Disponible: ${p.available_qty}` : 'Stock non initialise')
                      : 'Service (pas de stock)';
                    return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      disabled={!isSelectable}
                      className={`flex items-center gap-3 p-3 border rounded-lg text-left ${
                        !isSelectable
                          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      title={title}
                    >
                      <Plus size={18} className="text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{p.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-3">
                          <span>{formatCurrency(p.selling_price)}</span>
                          <span className={!p.track_stock || p.available_qty > 0 ? 'text-emerald-700' : 'text-gray-500 dark:text-gray-400'}>
                            {stockLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-3">
                  {debouncedSearch.trim().length >= 2 ? 'Aucun produit ne correspond a la recherche.' : 'Tapez au moins 2 caracteres pour filtrer, ou choisissez dans la liste.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right â€” Cart / Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 h-fit">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Panier</h2>

          {!sale || sale.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Le panier est vide.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {sale.items.map((item) => (
                <div key={item.id} className="py-2 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{item.product_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCurrency(item.unit_price)} / unite
                      </div>
                    </div>
                    <span className="text-sm font-semibold shrink-0 text-gray-900 dark:text-gray-100">{formatCurrency(item.line_total)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      {/* + button: add 1 more of this product */}
                      <button
                        onClick={() => handleAddOneMore(item.product)}
                        disabled={addItemMut.isPending}
                        className="p-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                        title="Ajouter 1"
                      >
                        <Plus size={14} />
                      </button>
                      <span className="text-sm font-medium min-w-[2rem] text-center text-gray-900 dark:text-gray-100">
                        {item.quantity}
                      </span>
                      {/* Remove button */}
                      <button
                        onClick={() => removeItemMut.mutate(item.id)}
                        disabled={removeItemMut.isPending}
                        className="p-1 rounded border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                        title="Retirer du panier"
                      >
                        {item.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Discount section */}
          {sale && sale.items.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Percent size={14} className="text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Remise</span>
              </div>
              <div className="flex gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => handleDiscountModeChange('none')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    discountMode === 'none'
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  Aucune
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscountModeChange('percent')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    discountMode === 'percent'
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  Pourcentage
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscountModeChange('fixed')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    discountMode === 'fixed'
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  Montant fixe
                </button>
              </div>
              {discountMode !== 'none' && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max={discountMode === 'percent' ? '100' : undefined}
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountMode === 'percent' ? '0 - 100' : 'Montant en FCFA'}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none pr-10 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
                      {discountMode === 'percent' ? '%' : 'FCFA'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscountApply}
                    disabled={updateSaleMut.isPending || !discountValue}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                  >
                    {updateSaleMut.isPending ? '...' : 'Appliquer'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Totals */}
          {sale && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sous-total</span>
                <span className="text-gray-900 dark:text-gray-100">{formatCurrency(sale.subtotal)}</span>
              </div>
              {parseFloat(sale.discount_amount) > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>
                    Remise
                    {parseFloat(sale.discount_percent) > 0 && (
                      <span className="text-xs ml-1">({parseFloat(sale.discount_percent)}%)</span>
                    )}
                  </span>
                  <span>-{formatCurrency(sale.discount_amount)}</span>
                </div>
              )}
              {parseFloat(sale.tax_amount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">TVA</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatCurrency(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1 text-gray-900 dark:text-gray-100">
                <span>Total</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
            </div>
          )}

          {/* Submit buttons */}
          {sale && sale.items.length > 0 && sale.customer && (
            <div className="mt-4 space-y-2">
              <button
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending || submitAndCashMut.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-success text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium disabled:opacity-60"
              >
                <Send size={16} />
                {submitMut.isPending ? 'Envoi...' : 'Soumettre en caisse'}
              </button>
              {canCash && (
                <button
                  onClick={() => submitAndCashMut.mutate()}
                  disabled={submitMut.isPending || submitAndCashMut.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  <Banknote size={16} />
                  {submitAndCashMut.isPending ? 'Envoi...' : 'Soumettre et encaisser'}
                </button>
              )}
            </div>
          )}

          {/* Hint if no customer yet */}
          {sale && sale.items.length > 0 && !sale.customer && (
            <p className="mt-3 text-xs text-amber-600 text-center">
              Selectionnez ou creez un client pour soumettre la vente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

