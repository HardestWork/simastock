/** Brand CRUD management page. */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { brandApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useSort } from '@/hooks/use-sort';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import { ChevronLeft, Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import type { Brand } from '@/api/types';
import type { AxiosError } from 'axios';

const PAGE_SIZE = 25;

interface BrandFormData {
  name: string;
  is_active: boolean;
}

const emptyForm: BrandFormData = {
  name: '',
  is_active: true,
};

export default function BrandListPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const { sortField, sortDirection, ordering, toggleSort } = useSort('name', 'asc');

  useEffect(() => { setPage(1); }, [ordering]);

  // List query
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.brands.list(params),
    queryFn: () => brandApi.list(params),
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Brand>) => brandApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      resetForm();
    },
    onError: (err: AxiosError) => {
      const detail = (err.response?.data as any)?.detail
        ?? (err.response?.data as any)?.name?.[0]
        ?? err.message;
      setFormError(String(detail));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Brand> }) =>
      brandApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      resetForm();
    },
    onError: (err: AxiosError) => {
      const detail = (err.response?.data as any)?.detail
        ?? (err.response?.data as any)?.name?.[0]
        ?? err.message;
      setFormError(String(detail));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  }

  function startEdit(brand: Brand) {
    setEditingId(brand.id);
    setForm({
      name: brand.name,
      is_active: brand.is_active,
    });
    setFormError('');
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire.');
      return;
    }

    const payload: Partial<Brand> = {
      name: form.name.trim(),
      is_active: form.is_active,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(brand: Brand) {
    if (window.confirm(`Supprimer la marque "${brand.name}" ? Cette action est irreversible.`)) {
      deleteMutation.mutate(brand.id);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
      >
        <ChevronLeft size={16} />
        Retour
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Marques</h1>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={16} />
            Nouvelle marque
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Modifier la marque' : 'Nouvelle marque'}
          </h2>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="Nom de la marque"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Active
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {isSaving ? 'Enregistrement...' : editingId ? 'Mettre a jour' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          Erreur chargement marques: {((error as AxiosError)?.response?.data as any)?.detail ?? (error as Error).message}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <SortableHeader field="name" label="Nom" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <SortableHeader field="is_active" label="Actif" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.results.map((brand) => (
                  <tr key={brand.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{brand.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          brand.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(brand)}
                          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary"
                        >
                          <Pencil size={14} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(brand)}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.results.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                      Aucune marque trouvee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
