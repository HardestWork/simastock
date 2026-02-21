/** Unified product create / edit page with image upload support. */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, categoryApi, brandApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { ArrowLeft, Save, Loader2, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // ---- Form state ----
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- Fetch existing product for edit mode ----
  const {
    data: product,
    isLoading: isLoadingProduct,
  } = useQuery({
    queryKey: queryKeys.products.detail(id!),
    queryFn: () => productApi.get(id!),
    enabled: isEdit,
  });

  // ---- Fetch categories & brands for dropdowns ----
  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.categories.list({ page_size: '100' }),
    queryFn: () => categoryApi.list({ page_size: '100' }),
  });

  const { data: brandsData } = useQuery({
    queryKey: queryKeys.brands.list({ page_size: '100' }),
    queryFn: () => brandApi.list({ page_size: '100' }),
  });

  // ---- Populate form when product loads (edit mode) ----
  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setCategory(product.category || '');
      setBrand(product.brand || '');
      setCostPrice(product.cost_price || '');
      setSellingPrice(product.selling_price || '');
      setIsActive(product.is_active ?? true);
    }
  }, [product]);

  // ---- Handle image selection ----
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // ---- Helpers to extract API error message ----
  const extractErrorMessage = (err: unknown): string => {
    const axiosErr = err as AxiosError<Record<string, unknown> | string>;
    const status = axiosErr?.response?.status;
    const data = axiosErr?.response?.data;
    if (data) {
      // When the gateway/server returns HTML (e.g. 413 upload too large, CSRF 403),
      // axios gives us a string. Avoid showing "0: < 1: h ..." to the user.
      if (typeof data === 'string') {
        const lower = data.toLowerCase();
        if (status === 413 || lower.includes('request entity too large') || lower.includes('payload too large')) {
          return 'Image trop lourde (limite upload). Essayez une image plus petite (ou compressez-la).';
        }
        if (status === 403 && lower.includes('csrf')) {
          return 'CSRF: session invalide. Rechargez la page puis reessayez.';
        }
        return status ? `Erreur serveur (${status}). Veuillez reessayer.` : 'Erreur serveur. Veuillez reessayer.';
      }
      if (typeof data.detail === 'string') return data.detail;
      // Collect field-level errors
      const messages: string[] = [];
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          messages.push(`${key}: ${val.join(', ')}`);
        } else if (typeof val === 'string') {
          messages.push(`${key}: ${val}`);
        }
      }
      if (messages.length > 0) return messages.join(' | ');
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  };

  // ---- Create mutation ----
  const createMut = useMutation({
    mutationFn: (data: FormData) => productApi.create(data),
    onSuccess: (response) => {
      toast.success('Produit cree avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      navigate(`/catalog/${response.id}`);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setSubmitError(extractErrorMessage(err));
    },
  });

  // ---- Update mutation ----
  const updateMut = useMutation({
    mutationFn: (data: FormData | Partial<Record<string, unknown>>) =>
      productApi.update(id!, data as Partial<import('@/api/types').Product> | FormData),
    onSuccess: () => {
      toast.success('Produit mis a jour avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id!) });
      navigate(`/catalog/${id}`);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setSubmitError(extractErrorMessage(err));
    },
  });

  // ---- Delete image mutation ----
  const deleteImageMut = useMutation({
    mutationFn: (imageId: string) => productApi.deleteImage(id!, imageId),
    onSuccess: () => {
      toast.success('Image supprimee');
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id!) });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const canSubmit =
    name.trim() !== '' &&
    sku.trim() !== '' &&
    costPrice.trim() !== '' &&
    sellingPrice.trim() !== '' &&
    !isPending;

  // ---- Submit handler ----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);

    if (isEdit && !imageFile) {
      // Edit without image — send JSON
      const jsonData: Record<string, unknown> = {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim(),
        category: category || null,
        brand: brand || null,
        cost_price: costPrice.trim(),
        selling_price: sellingPrice.trim(),
        is_active: isActive,
      };
      updateMut.mutate(jsonData);
    } else {
      // Create, or edit with new image — send FormData
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('sku', sku.trim());
      formData.append('barcode', barcode.trim());
      if (category) formData.append('category', category);
      if (brand) formData.append('brand', brand);
      formData.append('cost_price', costPrice.trim());
      formData.append('selling_price', sellingPrice.trim());
      formData.append('is_active', String(isActive));
      if (imageFile) {
        formData.append('image', imageFile);
      }

      if (isEdit) {
        updateMut.mutate(formData);
      } else {
        createMut.mutate(formData);
      }
    }
  };

  // ---- Loading spinner for edit mode ----
  if (isEdit && isLoadingProduct) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  // ---- Existing images from the product ----
  const existingImages = product?.images ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
      >
        <ArrowLeft size={16} />
        Retour au catalogue
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nom */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Nom du produit"
                required
              />
            </div>

            {/* SKU */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Ex: PRD-001"
                required
              />
            </div>

            {/* Code-barres */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Code-barres
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Code-barres (optionnel)"
              />
            </div>

            {/* Categorie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Categorie
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">-- Aucune categorie --</option>
                {categoriesData?.results
                  .filter((cat) => cat.is_active)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Marque */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Marque
              </label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">-- Aucune marque --</option>
                {brandsData?.results
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Prix d'achat */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Prix d'achat (FCFA) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="0"
                required
              />
            </div>

            {/* Prix de vente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Prix de vente (FCFA) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="0"
                required
              />
            </div>

            {/* Actif toggle */}
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Produit actif
                </span>
              </label>
            </div>

            {/* Image upload */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                Image
              </label>

              {/* Existing images (edit mode) */}
              {isEdit && existingImages.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Images actuelles :</p>
                  <div className="flex flex-wrap gap-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.image}
                          alt={product?.name}
                          className="w-24 h-24 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                        />
                        {img.is_primary && (
                          <span className="absolute top-1 left-1 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded">
                            Principale
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteImageMut.mutate(img.id)}
                          disabled={deleteImageMut.isPending}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Supprimer cette image"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New image preview */}
              {imagePreview && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Nouvelle image :</p>
                  <img
                    src={imagePreview}
                    alt="Apercu"
                    className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                  />
                </div>
              )}

              <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                <Upload size={16} />
                {imageFile ? imageFile.name : 'Choisir une image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>

              {imageFile && (
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="ml-2 text-xs text-red-500 hover:text-red-700"
                >
                  Retirer
                </button>
              )}
            </div>
          </div>

          {/* Error alert */}
          {submitError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <Link
              to="/catalog"
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEdit ? 'Mettre a jour' : 'Creer le produit'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
