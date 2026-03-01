/** Product catalog page with grid/list views, filters, and CRUD. */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, categoryApi, brandApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import { useAuthStore } from '@/auth/auth-store';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import {
  Search,
  Package,
  FolderTree,
  Tags,
  Plus,
  LayoutGrid,
  List,
  Trash2,
  Pencil,
  AlertCircle,
  Upload,
  Download,
} from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { toast } from '@/lib/toast';
import type { Product, CsvImportResult } from '@/api/types';
import { extractApiError } from '@/lib/api-error';

const PAGE_SIZE = 25;

type ViewMode = 'grid' | 'list';

export default function ProductListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('name', 'asc');
  const role = useAuthStore((s) => s.user?.role);
  const canManageCatalog = role === 'ADMIN' || role === 'MANAGER';
  const canImportCsv = role === 'ADMIN' || role === 'MANAGER';

  useEffect(() => { setPage(1); }, [ordering]);

  // Load categories and brands for filter dropdowns
  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.categories.list({ page_size: '100' }),
    queryFn: () => categoryApi.list({ page_size: '100' }),
  });

  const { data: brandsData } = useQuery({
    queryKey: queryKeys.brands.list({ page_size: '100' }),
    queryFn: () => brandApi.list({ page_size: '100' }),
  });

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (debouncedSearch) params.search = debouncedSearch;
  if (categoryFilter) params.category = categoryFilter;
  if (brandFilter) params.brand = brandFilter;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: () => productApi.list(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string; name: string }) => productApi.delete(payload.id),
    onSuccess: (_result, payload) => {
      toast.warning(`Produit supprime: ${payload.name}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      setProductToDelete(null);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => productApi.importCsv(file),
    onSuccess: (result) => {
      if (result.error_count === 0 && result.created + result.updated > 0) {
        toast.success(`Import CSV termine: ${result.created} crees, ${result.updated} mis a jour.`);
      } else if (result.error_count === 0) {
        toast.info('Import CSV termine: aucune modification detectee.');
      } else {
        toast.warning(`Import CSV partiel: ${result.error_count} erreur(s) detectee(s).`);
      }
      setImportResult(result);
      setImportError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err, 'Erreur lors de l\'import CSV'));
      setImportError(extractApiError(err, 'Import CSV impossible.'));
    },
  });

  const handleDelete = (product: Product) => {
    setProductToDelete(product);
  };

  const handleImportPick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setImportResult(null);
    setImportError(null);
    importMutation.mutate(file);
  };

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Catalogue produits</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCsv('products/export-csv/', 'produits')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <Download size={16} />
            Exporter CSV
          </button>
          {canImportCsv && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleImportPick}
                disabled={importMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
              >
                <Upload size={16} />
                {importMutation.isPending ? 'Import...' : 'Importer CSV'}
              </button>
            </>
          )}
          {canManageCatalog && (
            <>
              <Link
                to="/catalog/categories"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <FolderTree size={16} />
                Categories
              </Link>
              <Link
                to="/catalog/brands"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Tags size={16} />
                Marques
              </Link>
              <Link
                to="/catalog/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                <Plus size={18} />
                Nouveau produit
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Search + View toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher par nom, SKU ou code-barres..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Vue mosaique"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Vue liste"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Categorie</label>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Toutes les categories</option>
              {categoriesData?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marque</label>
            <select
              value={brandFilter}
              onChange={(e) => { setBrandFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Toutes les marques</option>
              {brandsData?.results.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>
          {data && (
            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 self-end pb-1">
              {data.count} produit{data.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Import status */}
      {importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <span>{importError}</span>
        </div>
      )}
      {importResult && (
        <div className={`border text-sm rounded-lg px-4 py-3 mb-4 ${importResult.error_count > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <div>
            {importResult.detail} Lignes: {importResult.total_rows} | Crees: {importResult.created} | Mis a jour: {importResult.updated} | Ignorees: {importResult.skipped} | Erreurs: {importResult.error_count}
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {importResult.errors.slice(0, 5).map((item) => (
                <li key={`${item.line}-${item.message}`}>
                  Ligne {item.line}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Delete error */}
      {deleteMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          Erreur lors de la suppression : {extractApiError(deleteMutation.error, 'Erreur inconnue')}
        </div>
      )}

      {/* Products */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Erreur chargement produits : {extractApiError(error)}
        </div>
      ) : viewMode === 'grid' ? (
        /* ===== GRID VIEW (Mosaique) ===== */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data?.results.map((product) => (
            <div
              key={product.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer group relative"
              onClick={() => navigate(`/catalog/${product.id}`)}
            >
              <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-3">
                {product.images?.[0] ? (
                  <img
                    src={product.images[0].image}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <Package size={32} className="text-gray-300 dark:text-gray-600" />
                )}
              </div>
              <h3 className="text-sm font-medium truncate">{product.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{product.sku}</p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    product.product_type === 'SERVICE'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {product.product_type === 'SERVICE' ? 'Service' : 'Produit'}
                </span>
              </div>
              {(product.category_name || product.brand_name) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {[product.category_name, product.brand_name].filter(Boolean).join(' Â· ')}
                </p>
              )}
              <p className="text-base font-bold text-primary mt-2">
                {formatCurrency(product.selling_price)}
              </p>
              {/* Actions overlay */}
              {canManageCatalog && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/catalog/${product.id}/edit`); }}
                    className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    title="Modifier"
                  >
                    <Pencil size={14} className="text-gray-600" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(product); }}
                    className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Supprimer"
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {data?.results.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
              Aucun produit trouve.
            </div>
          )}
        </div>
      ) : (
        /* ===== LIST VIEW (Liste) ===== */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600">
                <th className="px-4 py-3 font-medium w-12"></th>
                <SortableHeader field="name" label="Produit" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="sku" label="SKU" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Categorie</th>
                <th className="px-4 py-3 font-medium">Marque</th>
                <SortableHeader field="cost_price" label="Prix achat" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="selling_price" label="Prix vente" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="right" />
                <SortableHeader field="is_active" label="Actif" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                {canManageCatalog && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.results.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => navigate(`/catalog/${product.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0].image}
                          alt=""
                          className="w-10 h-10 object-contain rounded-lg"
                        />
                      ) : (
                        <Package size={18} className="text-gray-300 dark:text-gray-600" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                    {product.barcode && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">{product.barcode}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{product.sku}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        product.product_type === 'SERVICE'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {product.product_type === 'SERVICE' ? 'Service' : 'Produit'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{product.category_name || 'â€”'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{product.brand_name || 'â€”'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{formatCurrency(product.cost_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(product.selling_price)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </td>
                  {canManageCatalog && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/catalog/${product.id}/edit`); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Modifier"
                        >
                          <Pencil size={15} className="text-gray-500" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(product); }}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 size={15} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={canManageCatalog ? 10 : 9} className="px-4 py-8 text-center text-gray-500">
                    Aucun produit trouve.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {canManageCatalog && (
        <ConfirmDialog
          open={!!productToDelete}
          title="Supprimer ce produit ?"
          message={
            productToDelete
              ? `Le produit "${productToDelete.name}" sera supprime definitivement.`
              : ''
          }
          confirmLabel="Supprimer"
          tone="danger"
          loading={deleteMutation.isPending}
          onClose={() => setProductToDelete(null)}
          onConfirm={() => {
            if (!productToDelete) return;
            deleteMutation.mutate({ id: productToDelete.id, name: productToDelete.name });
          }}
        />
      )}
    </div>
  );
}

