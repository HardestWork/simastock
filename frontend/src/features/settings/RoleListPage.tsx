/** CRUD page for custom roles (ADMIN only). */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import { Plus, Pencil, Trash2, X, Save, Loader2, Shield } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { CustomRole, UserRole } from '@/api/types';

const BASE_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'SALES', label: 'Vendeur' },
  { value: 'CASHIER', label: 'Caissier' },
  { value: 'STOCKER', label: 'Magasinier' },
];

const BASE_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

interface FormState {
  name: string;
  base_role: UserRole;
  description: string;
  is_active: boolean;
}

const emptyForm: FormState = { name: '', base_role: 'SALES', description: '', is_active: true };

export default function RoleListPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('name', 'asc');

  const roleParams: Record<string, string> = { page_size: '100' };
  if (ordering) roleParams.ordering = ordering;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.roles.list(roleParams),
    queryFn: () => roleApi.list(roleParams),
  });

  const roles = data?.results ?? [];

  const createMut = useMutation({
    mutationFn: (d: Partial<CustomRole>) => roleApi.create(d),
    onSuccess: (createdRole) => {
      toast.success(`Role cree: ${createdRole.name}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setFormError('Erreur lors de la creation du role.');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<CustomRole> }) => roleApi.update(id, d),
    onSuccess: (updatedRole) => {
      toast.info(`Role mis a jour: ${updatedRole.name}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setFormError('Erreur lors de la mise a jour du role.');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => roleApi.delete(id),
    onSuccess: () => {
      const removedRole = roles.find((r) => r.id === deleteConfirm);
      toast.warning(`Role supprime: ${removedRole?.name ?? 'role'}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      setDeleteConfirm(null);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  }

  function startEdit(role: CustomRole) {
    setEditingId(role.id);
    setForm({
      name: role.name,
      base_role: role.base_role,
      description: role.description,
      is_active: role.is_active,
    });
    setShowForm(true);
    setFormError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Le nom du role est obligatoire.');
      return;
    }

    if (editingId) {
      updateMut.mutate({ id: editingId, data: form });
    } else {
      createMut.mutate(form);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Roles personnalises</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Creez des roles nommes associes a un niveau de permission systeme.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setFormError(''); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Nouveau role
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {editingId ? 'Modifier le role' : 'Nouveau role'}
          </h2>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom du role <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Ex: Responsable magasin"
                required
              />
            </div>

            {/* Base role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Niveau de permission <span className="text-red-500">*</span>
              </label>
              <select
                value={form.base_role}
                onChange={(e) => setForm((f) => ({ ...f, base_role: e.target.value as UserRole }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              >
                {BASE_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Les permissions seront heritees de ce niveau systeme.
              </p>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100 resize-none"
                placeholder="Description du role (optionnel)"
              />
            </div>

            {/* Active toggle (edit mode) */}
            {editingId && (
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actif</span>
                </label>
              </div>
            )}
          </div>

          {/* Form actions */}
          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <X size={16} />
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Enregistrement...</>
              ) : (
                <><Save size={16} /> {editingId ? 'Mettre a jour' : 'Creer le role'}</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : roles.length === 0 && !showForm ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Shield size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Aucun role personnalise</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Les utilisateurs utilisent actuellement les 5 roles systeme par defaut.
          </p>
        </div>
      ) : roles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <SortableHeader field="name" label="Nom" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="base_role" label="Niveau" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">Description</th>
                <SortableHeader field="is_active" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{role.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {BASE_ROLE_LABELS[role.base_role] ?? role.base_role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell max-w-xs truncate">
                    {role.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${role.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => startEdit(role)}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Pencil size={15} />
                      </button>
                      {deleteConfirm === role.id ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <button
                            onClick={() => deleteMut.mutate(role.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            Oui
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                          >
                            Non
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(role.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

