/** Product detail page — displays full product info, specs, and stock levels. */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productApi, stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/auth/auth-store';
import { ArrowLeft, Pencil, Package, Barcode, Tag, FolderTree, AlertCircle, FileText, QrCode, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { extractApiError } from '@/lib/api-error';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const canManageCatalog = role === 'ADMIN' || role === 'MANAGER';

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.products.detail(id!),
    queryFn: () => productApi.get(id!),
    enabled: !!id,
  });

  const stockParams: Record<string, string> = { product: id! };

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: queryKeys.stockLevels.list(stockParams),
    queryFn: () => stockApi.levels(stockParams),
    enabled: !!id && product?.track_stock === true,
  });

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const costPrice = product ? parseFloat(product.cost_price) : 0;
  const sellingPrice = product ? parseFloat(product.selling_price) : 0;
  const margin = sellingPrice - costPrice;
  const marginPercent = costPrice > 0 ? ((margin / costPrice) * 100).toFixed(1) : '—';

  const primaryImage = product?.images?.find((img) => img.is_primary) ?? product?.images?.[0];

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (isError) {
    const status = (error as any)?.response?.status;
    const detail = extractApiError(error);

    if (status === 404) {
      return (
        <div className="max-w-xl mx-auto py-16 text-center">
          <Package size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Produit introuvable</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Le produit demande n'existe pas ou a ete supprime.
          </p>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <ArrowLeft size={16} />
            Retour au catalogue
          </Link>
        </div>
      );
    }

    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
        <AlertCircle size={16} />
        Erreur lors du chargement du produit : {detail}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Not found (product is null/undefined after successful fetch)
  // -------------------------------------------------------------------------

  if (!product) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <Package size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Produit introuvable</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Le produit demande n'existe pas ou a ete supprime.
        </p>
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <ArrowLeft size={16} />
          Retour au catalogue
        </Link>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div>
      {/* ================================================================= */}
      {/* Header                                                            */}
      {/* ================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product.name}</h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              product.is_active
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {product.is_active ? 'Actif' : 'Inactif'}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            {product.sku}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              product.product_type === 'SERVICE'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-sky-100 text-sky-700'
            }`}
          >
            {product.product_type === 'SERVICE' ? 'Service' : 'Produit'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/catalog"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <ArrowLeft size={16} />
            Retour
          </Link>
          {canManageCatalog && (
            <Link
              to={`/catalog/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Pencil size={16} />
              Modifier
            </Link>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Main content grid                                                 */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* -------------------------------------------------------------- */}
        {/* Left column: Image                                              */}
        {/* -------------------------------------------------------------- */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="w-full aspect-square bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
              {primaryImage ? (
                <img
                  src={primaryImage.image}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <Package size={64} className="text-gray-300" />
              )}
            </div>

            {/* Thumbnail strip when multiple images */}
            {product.images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {product.images
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((img) => (
                    <div
                      key={img.id}
                      className={`w-16 h-16 flex-shrink-0 rounded-lg border overflow-hidden ${
                        img.id === primaryImage?.id
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-gray-200'
                      }`}
                    >
                      <img
                        src={img.image}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* QR Code card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <QrCode size={16} />
              QR Code produit
            </h3>
            <div className="flex flex-col items-center gap-3">
              <div id="product-qr" className="bg-white p-3 rounded-lg">
                <QRCodeSVG
                  value={product.barcode || product.sku || product.id}
                  size={160}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {product.barcode || product.sku}
              </p>
              <button
                onClick={() => {
                  const svg = document.querySelector('#product-qr svg');
                  if (!svg) return;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  const img = new Image();
                  img.onload = () => {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx!.fillStyle = '#ffffff';
                    ctx!.fillRect(0, 0, canvas.width, canvas.height);
                    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const a = document.createElement('a');
                    a.download = `qr-${product.sku || product.id}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                  };
                  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Download size={14} />
                Telecharger PNG
              </button>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Right column: Info + Specs + Stock                              */}
        {/* -------------------------------------------------------------- */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* ---- Product info card ---- */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Informations produit</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {/* SKU */}
              <div className="flex items-start gap-3">
                <Tag size={18} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">SKU</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.sku || '—'}</p>
                </div>
              </div>

              {/* Barcode */}
              <div className="flex items-start gap-3">
                <Barcode size={18} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Code-barres</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.barcode || '—'}</p>
                </div>
              </div>

              {/* Category */}
              <div className="flex items-start gap-3">
                <FolderTree size={18} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Categorie</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.category_name || '—'}</p>
                </div>
              </div>

              {/* Brand */}
              <div className="flex items-start gap-3">
                <Tag size={18} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Marque</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.brand_name || '—'}</p>
                </div>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <>
                <hr className="my-5 border-gray-100 dark:border-gray-700" />
                <div className="flex items-start gap-3">
                  <FileText size={18} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{product.description}</p>
                  </div>
                </div>
              </>
            )}

            {/* Pricing section */}
            <hr className="my-5 border-gray-100 dark:border-gray-700" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Prix d'achat</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(product.cost_price)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Prix de vente</p>
                <p className="text-lg font-semibold text-primary">{formatCurrency(product.selling_price)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Marge</p>
                <p className={`text-lg font-semibold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(margin)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {marginPercent !== '—' ? `${marginPercent} %` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ---- Specs card (only if specs exist) ---- */}
          {product.specs.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Specifications</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-gray-500">
                    <th className="pb-2 font-medium">Propriete</th>
                    <th className="pb-2 font-medium">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {product.specs.map((spec) => (
                    <tr key={spec.id} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-2.5 text-gray-600 dark:text-gray-400">{spec.key}</td>
                      <td className="py-2.5 font-medium text-gray-900 dark:text-gray-100">{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---- Stock levels card ---- */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Stock par magasin</h2>

            {!product.track_stock ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-6">
                Ce service ne suit pas de stock.
              </p>
            ) : stockLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : stockData && stockData.results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 text-left text-gray-600">
                      <th className="px-4 py-3 font-medium">Magasin</th>
                      <th className="px-4 py-3 font-medium text-right">Quantite</th>
                      <th className="px-4 py-3 font-medium text-right">Reserve</th>
                      <th className="px-4 py-3 font-medium text-right">Disponible</th>
                      <th className="px-4 py-3 font-medium text-right">Seuil min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockData.results.map((stock) => {
                      const belowMin = stock.available_qty <= stock.min_qty && stock.min_qty > 0;
                      return (
                        <tr key={stock.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 font-medium text-gray-900">{stock.store}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{stock.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{stock.reserved_qty}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${belowMin ? 'text-red-600' : 'text-emerald-600'}`}>
                            {stock.available_qty}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{stock.min_qty}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-6">
                Aucune donnee de stock disponible pour ce produit.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
