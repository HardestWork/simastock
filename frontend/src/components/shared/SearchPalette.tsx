/** Global search command palette — Ctrl+K to open. */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, LayoutDashboard, ShoppingCart, Package, Users, CreditCard, Layers, BarChart3, Settings, FileText, Bell, Truck, Brain, Banknote, PieChart, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { productApi, customerApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  path: string;
  group: string;
}

const PAGE_ITEMS: SearchResult[] = [
  { id: 'p-dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={18} />, path: '/dashboard', group: 'Pages' },
  { id: 'p-pos', label: 'Point de Vente', icon: <ShoppingCart size={18} />, path: '/pos', group: 'Pages' },
  { id: 'p-pos-new', label: 'Nouvelle vente', icon: <ShoppingCart size={18} />, path: '/pos/new', group: 'Pages' },
  { id: 'p-quotes', label: 'Devis', icon: <FileText size={18} />, path: '/quotes', group: 'Pages' },
  { id: 'p-cashier', label: 'Caisse', icon: <Banknote size={18} />, path: '/cashier', group: 'Pages' },
  { id: 'p-catalog', label: 'Catalogue produits', icon: <Package size={18} />, path: '/catalog', group: 'Pages' },
  { id: 'p-catalog-new', label: 'Nouveau produit', icon: <Package size={18} />, path: '/catalog/new', group: 'Pages' },
  { id: 'p-categories', label: 'Categories', icon: <Package size={18} />, path: '/catalog/categories', group: 'Pages' },
  { id: 'p-brands', label: 'Marques', icon: <Package size={18} />, path: '/catalog/brands', group: 'Pages' },
  { id: 'p-stock', label: 'Niveaux de stock', icon: <Layers size={18} />, path: '/stock', group: 'Pages' },
  { id: 'p-movements', label: 'Mouvements de stock', icon: <Layers size={18} />, path: '/stock/movements', group: 'Pages' },
  { id: 'p-transfers', label: 'Transferts', icon: <Layers size={18} />, path: '/stock/transfers', group: 'Pages' },
  { id: 'p-counts', label: 'Inventaires', icon: <Layers size={18} />, path: '/stock/counts', group: 'Pages' },
  { id: 'p-customers', label: 'Clients', icon: <Users size={18} />, path: '/customers', group: 'Pages' },
  { id: 'p-customer-new', label: 'Nouveau client', icon: <Users size={18} />, path: '/customers/new', group: 'Pages' },
  { id: 'p-credits', label: 'Credits', icon: <CreditCard size={18} />, path: '/credits', group: 'Pages' },
  { id: 'p-expenses', label: 'Depenses', icon: <Wallet size={18} />, path: '/expenses', group: 'Pages' },
  { id: 'p-expenses-dash', label: 'Dashboard depenses', icon: <PieChart size={18} />, path: '/expenses/dashboard', group: 'Pages' },
  { id: 'p-expenses-settings', label: 'Parametres depenses', icon: <Settings size={18} />, path: '/expenses/settings', group: 'Pages' },
  { id: 'p-purchases', label: 'Achats', icon: <Truck size={18} />, path: '/purchases', group: 'Pages' },
  { id: 'p-reports', label: 'Rapports', icon: <BarChart3 size={18} />, path: '/reports', group: 'Pages' },
  { id: 'p-statistics', label: 'Statistiques', icon: <PieChart size={18} />, path: '/statistics', group: 'Pages' },
  { id: 'p-analytics', label: 'Analytics AI', icon: <Brain size={18} />, path: '/analytics', group: 'Pages' },
  { id: 'p-alerts', label: 'Alertes', icon: <Bell size={18} />, path: '/alerts', group: 'Pages' },
  { id: 'p-settings', label: 'Parametres', icon: <Settings size={18} />, path: '/settings', group: 'Pages' },
  { id: 'p-profile', label: 'Mon profil', icon: <Users size={18} />, path: '/profile', group: 'Pages' },
];

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';

  // Keyboard shortcut to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search products (debounced by query length >= 2)
  const shouldSearch = open && query.length >= 2;
  const { data: productsData } = useQuery({
    queryKey: ['search', 'products', query, storeId],
    queryFn: () => productApi.list({ search: query, store: storeId, page_size: '5' }),
    enabled: shouldSearch && !!storeId,
    staleTime: 10_000,
  });

  const { data: customersData } = useQuery({
    queryKey: ['search', 'customers', query],
    queryFn: () => customerApi.list({ search: query, page_size: '5' }),
    enabled: shouldSearch,
    staleTime: 10_000,
  });

  // Build results
  const results = useMemo(() => {
    const items: SearchResult[] = [];
    const q = query.toLowerCase().trim();

    // Filter pages
    const filteredPages = q
      ? PAGE_ITEMS.filter((p) => p.label.toLowerCase().includes(q))
      : PAGE_ITEMS.slice(0, 6);
    items.push(...filteredPages);

    // Products
    if (productsData?.results) {
      productsData.results.forEach((p) => {
        items.push({
          id: `prod-${p.id}`,
          label: p.name,
          sublabel: p.sku ? `SKU: ${p.sku}` : (p.category_name ?? ''),
          icon: <Package size={18} />,
          path: `/catalog/${p.id}`,
          group: 'Produits',
        });
      });
    }

    // Customers
    if (customersData?.results) {
      customersData.results.forEach((c) => {
        items.push({
          id: `cust-${c.id}`,
          label: c.full_name,
          sublabel: c.phone || c.email || '',
          icon: <Users size={18} />,
          path: `/customers/${c.id}`,
          group: 'Clients',
        });
      });
    }

    return items;
  }, [query, productsData, customersData]);

  // Group results
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach((r) => {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    });
    return map;
  }, [results]);

  const flatResults = results;

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      navigate(result.path);
    },
    [navigate],
  );

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatResults[activeIndex]) {
      e.preventDefault();
      handleSelect(flatResults[activeIndex]);
    }
  }

  // Scroll active into view
  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!open) return null;

  let itemIndex = -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={20} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une page, un produit, un client..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {flatResults.length === 0 && query.length > 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Aucun resultat pour &laquo; {query} &raquo;
            </div>
          )}

          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {group}
              </div>
              {items.map((result) => {
                itemIndex++;
                const idx = itemIndex;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={result.id}
                    data-active={isActive}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary dark:bg-primary/20'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className={isActive ? 'text-primary' : 'text-gray-400'}>{result.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{result.label}</div>
                      {result.sublabel && (
                        <div className="truncate text-xs text-gray-400">{result.sublabel}</div>
                      )}
                    </div>
                    {isActive && <ArrowRight size={16} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">↑↓</kbd> naviguer</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">↵</kbd> ouvrir</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">esc</kbd> fermer</span>
        </div>
      </div>
    </div>
  );
}
