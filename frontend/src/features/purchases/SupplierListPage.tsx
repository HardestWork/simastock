/** Supplier CRUD management page with inline modal. */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import { Search, Plus, Pencil, Trash2, X, Phone, Mail, MapPin, User } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { Supplier } from '@/api/types';
import type { AxiosError } from 'axios';

const PAGE_SIZE = 25;

interface SupplierFormData {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
}

const emptyForm: SupplierFormData = {
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
};

export default function SupplierListPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('name', 'asc');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierFormData>(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => { setPage(1); }, [ordering]);

  // Build query params
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (debouncedSearch) params.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.suppliers.list(params),
    queryFn: () => supplierApi.list(params),
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Supplier>) => supplierApi.create(data),
    onSuccess: () => {
      toast.success(`Fournisseur cree: ${form.name.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      resetForm();
    },
    onError: (err: AxiosError) => {
      toast.error(
        (err.response?.data as any)?.detail
          || (err.response?.data as any)?.non_field_errors?.[0]
          || 'Erreur lors de la creation du fournisseur',
      );
      const detail =
        (err.response?.data as any)?.detail
        ?? (err.response?.data as any)?.name?.[0]
        ?? err.message;
      setFormError(String(detail));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Supplier> }) =>
      supplierApi.update(id, data),
    onSuccess: () => {
      toast.success(`Fournisseur mis a jour: ${form.name.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      resetForm();
    },
    onError: (err: AxiosError) => {
      toast.error(
        (err.response?.data as any)?.detail
          || (err.response?.data as any)?.non_field_errors?.[0]
          || 'Erreur lors de la mise a jour du fournisseur',
      );
      const detail =
        (err.response?.data as any)?.detail
        ?? (err.response?.data as any)?.name?.[0]
        ?? err.message;
      setFormError(String(detail));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => supplierApi.delete(id),
    onSuccess: () => {
      toast.success('Fournisseur supprime avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
    onError: (err: unknown) => {
      toast.error(
        (err as any)?.response?.data?.detail
          || (err as any)?.response?.data?.non_field_errors?.[0]
          || 'Erreur lors de la suppression du fournisseur',
      );
    },
  });

  function resetForm() {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contact_name: supplier.contact_name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      is_active: supplier.is_active,
    });
    setFormError('');
    setShowModal(true);
  }

  function handleDelete(supplier: Supplier) {
    if (window.confirm(`Supprimer le fournisseur "${supplier.name}" ? Cette action est irreversible.`)) {
      deleteMutation.mutate(supplier.id);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Le nom du fournisseur est obligatoire.');
      return;
    }

    const payload: Partial<Supplier> = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      is_active: form.is_active,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fournisseurs</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={18} />
          Nouveau fournisseur
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom, contact ou telephone..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <SortableHeader field="name" label="Nom" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Telephone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.results.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {supplier.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {supplier.contact_name || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {supplier.phone || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {supplier.email || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          supplier.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {supplier.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(supplier)}
                          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary"
                        >
                          <Pencil size={14} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(supplier)}
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
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Aucun fournisseur trouve.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Modal for create/edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form error */}
            {formError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
                {formError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom du fournisseur <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Nom du fournisseur"
                    autoFocus
                  />
                </div>
              </div>

              {/* Contact name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom du contact
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Nom de la personne de contact"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Telephone
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Numero de telephone"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="adresse@email.com"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Adresse
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    rows={2}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100 resize-none"
                    placeholder="Adresse du fournisseur"
                  />
                </div>
              </div>

              {/* Is Active toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supplier_is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="supplier_is_active" className="text-sm text-gray-700 dark:text-gray-300">
                  Fournisseur actif
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                >
                  {isSaving ? 'Enregistrement...' : editingId ? 'Mettre a jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
