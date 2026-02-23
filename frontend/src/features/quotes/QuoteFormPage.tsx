/** Quote form page â€” create or edit a draft quote. */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, quoteApi, customerApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import type { Quote, PosProduct } from '@/api/types';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Save,
  UserPlus,
  Percent,
  X,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react';
import type { AxiosError } from 'axios';
import { toast } from '@/lib/toast';

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

export default function QuoteFormPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const currentStore = useStoreStore((s) => s.currentStore);

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const [quote, setQuote] = useState<Quote | null>(null);
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

  // Notes & conditions
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('');

  // ------------------------------------------------------------------
  // Edit-mode: load existing quote
  // ------------------------------------------------------------------
  const { data: existingQuote } = useQuery({
    queryKey: queryKeys.quotes.detail(id!),
    queryFn: () => quoteApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (existingQuote) {
      setQuote(existingQuote);
      setNotes(existingQuote.notes || '');
      setConditions(existingQuote.conditions || '');
      if (parseFloat(existingQuote.discount_percent) > 0) {
        setDiscountMode('percent');
        setDiscountValue(existingQuote.discount_percent);
      }
    }
  }, [existingQuote]);

  // ------------------------------------------------------------------
  // Product search query
  // ------------------------------------------------------------------
  const productParams: Record<string, string> = {
    store: currentStore?.id ?? '',
    page_size: '20',
    ordering: 'name',
  };
  if (debouncedSearch.trim().length >= 2) {
    productParams.search = debouncedSearch.trim();
  }
  const {
    data: products,
    isLoading: isProductsLoading,
    isError: isProductsError,
    error: productsError,
  } = useQuery({
    queryKey: ['pos', 'products', productParams],
    queryFn: () => productApi.available(productParams),
    enabled: !!currentStore,
  });

  // ------------------------------------------------------------------
  // Customer search query
  // ------------------------------------------------------------------
  const { data: customers } = useQuery({
    queryKey: queryKeys.customers.list({ search: debouncedCustomerSearch }),
    queryFn: () => customerApi.list({ search: debouncedCustomerSearch }),
    enabled: debouncedCustomerSearch.length >= 2,
  });

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------
  const createQuoteMut = useMutation({
    mutationFn: (customerId?: string) =>
      quoteApi.create({
        store_id: currentStore!.id,
        customer_id: customerId,
        notes: notes || undefined,
        conditions: conditions || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Devis cree: ${data.quote_number ?? `#${data.id.slice(0, 8).toUpperCase()}`}`);
      setActionError(null);
      setQuote(data);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const addItemMut = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      quoteApi.addItem(quote!.id, { product_id: productId, quantity }),
    onSuccess: (data, variables) => {
      const productName =
        products?.results.find((product) => product.id === variables.productId)?.name ?? 'Article';
      toast.info(`Article ajoute: ${productName}`);
      setActionError(null);
      setQuote(data);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const removeItemMut = useMutation({
    mutationFn: (itemId: string) => quoteApi.removeItem(quote!.id, itemId),
    onSuccess: (data, itemId) => {
      const removedItemName =
        quote?.items.find((item) => item.id === itemId)?.product_name ?? 'Article';
      toast.warning(`Article retire: ${removedItemName}`);
      setActionError(null);
      setQuote(data);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const updateQuoteMut = useMutation({
    mutationFn: (data: Record<string, string>) => quoteApi.update(quote!.id, data),
    onSuccess: (data) => {
      toast.info(`Devis mis a jour: ${data.quote_number ?? 'brouillon'}`);
      setActionError(null);
      setQuote(data);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const createCustomerMut = useMutation({
    mutationFn: () =>
      customerApi.create({
        first_name: newCustomerFirstName.trim(),
        last_name: newCustomerLastName.trim(),
        phone: newCustomerPhone.trim(),
      }),
    onSuccess: (newCustomer) => {
      toast.success(`Client cree: ${newCustomer.full_name}`);
      setNewCustomerFirstName('');
      setNewCustomerLastName('');
      setNewCustomerPhone('');
      setShowNewCustomerForm(false);
      setCustomerSearch('');
      setIsChangingCustomer(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

      if (quote) {
        updateQuoteMut.mutate({ customer: newCustomer.id });
      } else {
        createQuoteMut.mutate(newCustomer.id);
      }
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const saveMut = useMutation({
    mutationFn: () =>
      quoteApi.update(quote!.id, {
        notes,
        conditions,
      }),
    onSuccess: () => {
      toast.success(`Devis enregistre: ${quote?.quote_number ?? 'sans numero'}`);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      navigate(`/quotes/${quote!.id}`);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  function handleSelectProduct(product: PosProduct) {
    setActionError(null);
    if (!quote) {
      createQuoteMut.mutate(undefined, {
        onSuccess: (newQuote) => {
          setQuote(newQuote);
          quoteApi
            .addItem(newQuote.id, { product_id: product.id, quantity: 1 })
            .then((updated) => setQuote(updated))
            .catch((err) => setActionError(extractErrorMessage(err)));
        },
      });
    } else {
      addItemMut.mutate({ productId: product.id, quantity: 1 });
    }
    setSearch('');
  }

  function handleAddOneMore(productId: string) {
    if (!quote) return;
    addItemMut.mutate({ productId, quantity: 1 });
  }

  function handleSelectCustomer(customerId: string) {
    if (!quote) {
      createQuoteMut.mutate(customerId);
    } else {
      updateQuoteMut.mutate({ customer: customerId });
    }
    setCustomerSearch('');
    setIsChangingCustomer(false);
  }

  function handleDiscountModeChange(mode: DiscountMode) {
    setDiscountMode(mode);
    setDiscountValue('');
    if (mode === 'none' && quote) {
      updateQuoteMut.mutate({ discount_percent: '0' });
    }
  }

  function handleDiscountApply() {
    if (!quote || !discountValue) return;
    if (discountMode === 'percent') {
      const val = Math.min(100, Math.max(0, parseFloat(discountValue) || 0));
      updateQuoteMut.mutate({ discount_percent: val.toString() });
    }
    if (discountMode === 'fixed') {
      const subtotal = parseFloat(quote.subtotal) || 0;
      if (subtotal > 0) {
        const fixedAmt = Math.min(subtotal, Math.max(0, parseFloat(discountValue) || 0));
        const pct = (fixedAmt / subtotal) * 100;
        updateQuoteMut.mutate({ discount_percent: pct.toFixed(2) });
      }
    }
  }

  function handleCreateCustomerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerFirstName.trim() || !newCustomerLastName.trim() || !newCustomerPhone.trim()) return;
    createCustomerMut.mutate();
  }

  function handleSave() {
    if (!quote) return;
    saveMut.mutate();
  }

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  const noCustomerResults =
    debouncedCustomerSearch.length >= 2 &&
    customers !== undefined &&
    customers.results.length === 0;

  const showCustomerSearch = !quote || !quote.customer || isChangingCustomer;

  // ------------------------------------------------------------------
  // Guards
  // ------------------------------------------------------------------
  if (!currentStore) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucun magasin selectionne.</div>;
  }

  if (isEditMode && existingQuote && existingQuote.status !== 'DRAFT') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400 mb-4">Seuls les devis en brouillon peuvent etre modifies.</p>
        <Link
          to={`/quotes/${id}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
        >
          <ChevronLeft size={14} /> Retour au devis
        </Link>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to="/quotes"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
          >
            <ChevronLeft size={14} /> Retour aux devis
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isEditMode ? 'Modifier le devis' : 'Nouveau devis'}
          </h1>
        </div>
        {quote && quote.items.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium disabled:opacity-60"
          >
            <Save size={16} />
            {saveMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        )}
      </div>

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
        {/* Left â€” 2 cols: Notes, Customer search, Product search */}
        <div className="lg:col-span-2 space-y-4">
          {/* Notes & conditions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes internes..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Conditions</label>
                <textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  rows={2}
                  placeholder="Conditions commerciales..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Customer search */}
          {showCustomerSearch && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Client</label>
                {isChangingCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingCustomer(false);
                      setCustomerSearch('');
                      setShowNewCustomerForm(false);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Annuler
                  </button>
                )}
              </div>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
                <form
                  onSubmit={handleCreateCustomerSubmit}
                  className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 space-y-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nouveau client</span>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomerForm(false)}
                      className="p-0.5 text-gray-400 hover:text-gray-600"
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
                      Erreur:{' '}
                      {((createCustomerMut.error as AxiosError)?.response?.data as any)?.detail ??
                        'Impossible de creer le client.'}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Selected customer summary */}
          {quote?.customer && !isChangingCustomer && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Client</span>
                <button
                  type="button"
                  onClick={() => setIsChangingCustomer(true)}
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                >
                  Changer
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-900">
                {quote.customer_name || 'Client selectionne'}
              </p>
            </div>
          )}

          {/* Product search */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ajouter un produit
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
                <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  Chargement des produits...
                </div>
              ) : isProductsError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  Erreur chargement produits:{' '}
                  {((productsError as AxiosError)?.response?.data as any)?.detail ??
                    (productsError as Error).message}
                </div>
              ) : products && products.results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {products.results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      title={
                        p.track_stock
                          ? (p.has_stock ? `Disponible: ${p.available_qty}` : 'Stock non initialise')
                          : 'Service (pas de stock)'
                      }
                    >
                      <Plus size={18} className="text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-3">
                          <span>{formatCurrency(p.selling_price)}</span>
                          <span className={!p.track_stock || p.available_qty > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                            {p.track_stock ? (p.has_stock ? `Stock: ${p.available_qty}` : 'Stock: --') : 'Service'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 py-3">
                  {debouncedSearch.trim().length >= 2
                    ? 'Aucun produit ne correspond a la recherche.'
                    : 'Tapez au moins 2 caracteres pour filtrer, ou choisissez dans la liste.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right â€” Cart / Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 h-fit">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Articles du devis</h2>

          {!quote || quote.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Aucun article dans le devis.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {quote.items.map((item) => (
                <div key={item.id} className="py-2 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.product_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCurrency(item.unit_price)} / unite
                      </div>
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      {formatCurrency(item.line_total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAddOneMore(item.product)}
                        disabled={addItemMut.isPending}
                        className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                        title="Ajouter 1"
                      >
                        <Plus size={14} />
                      </button>
                      <span className="text-sm font-medium min-w-[2rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => removeItemMut.mutate(item.id)}
                        disabled={removeItemMut.isPending}
                        className="p-1 rounded border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        title="Retirer du devis"
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
          {quote && quote.items.length > 0 && (
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
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Aucune
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscountModeChange('percent')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    discountMode === 'percent'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Pourcentage
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscountModeChange('fixed')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    discountMode === 'fixed'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {discountMode === 'percent' ? '%' : 'FCFA'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscountApply}
                    disabled={updateQuoteMut.isPending || !discountValue}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                  >
                    {updateQuoteMut.isPending ? '...' : 'Appliquer'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Totals */}
          {quote && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sous-total</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
              {parseFloat(quote.discount_amount) > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>
                    Remise
                    {parseFloat(quote.discount_percent) > 0 && (
                      <span className="text-xs ml-1">
                        ({parseFloat(quote.discount_percent)}%)
                      </span>
                    )}
                  </span>
                  <span>-{formatCurrency(quote.discount_amount)}</span>
                </div>
              )}
              {parseFloat(quote.tax_amount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">TVA</span>
                  <span>{formatCurrency(quote.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1">
                <span>Total</span>
                <span>{formatCurrency(quote.total)}</span>
              </div>
            </div>
          )}

          {/* Save button */}
          {quote && quote.items.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium disabled:opacity-60"
            >
              <Save size={16} />
              {saveMut.isPending ? 'Enregistrement...' : 'Enregistrer le devis'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

