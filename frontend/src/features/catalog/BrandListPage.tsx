/** Brand CRUD management page. */
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { brandApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useSort } from '@/hooks/use-sort';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { ChevronLeft, Plus, Pencil, Trash2, AlertCircle, Upload, Download, FileSpreadsheet, X, CheckCircle } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { toast } from '@/lib/toast';
import type { Brand } from '@/api/types';
import { extractApiError } from '@/lib/api-error';

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
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      toast.success(`Marque creee: ${form.name.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setFormError(extractApiError(err));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Brand> }) =>
      brandApi.update(id, data),
    onSuccess: () => {
      toast.success(`Marque mise a jour: ${form.name.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setFormError(extractApiError(err));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string; name: string }) => brandApi.delete(payload.id),
    onSuccess: (_result, payload) => {
      toast.warning(`Marque supprimee: ${payload.name}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      setBrandToDelete(null);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // Import CSV mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => brandApi.importCsv(file),
    onSuccess: (result) => {
      toast.success(result.detail);
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
      setShowImport(false);
      setImportFile(null);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err, 'Erreur lors de l\'import'));
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
    setBrandToDelete(brand);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
      >
        <ChevronLeft size={16} />
        Retour
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marques</h1>
        {!showForm && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCsv('brands/export-csv/', 'marques')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Download size={16} />
              Exporter CSV
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Upload size={16} />
              Importer CSV
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus size={16} />
              Nouvelle marque
            </button>
          </div>
        )}
      </div>

      {/* Import CSV dialog */}
      {showImport && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileSpreadsheet size={20} />
              Importer des marques depuis un fichier CSV
            </h2>
            <button onClick={() => { setShowImport(false); setImportFile(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={20} />
            </button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 mb-4 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Format attendu :</p>
            <p>Le fichier doit contenir une colonne <strong>nom</strong> (ou <em>name</em>, <em>marque</em>, <em>brand</em>).</p>
            <p>Colonne optionnelle : <strong>actif</strong> (ou <em>is_active</em>, <em>active</em>) — valeurs : oui/non, 1/0, true/false.</p>
            <p className="mt-1 text-xs">Separateurs acceptes : virgule, point-virgule, tabulation. Encodage : UTF-8 ou Latin-1.</p>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              importFile
                ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-700/30'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImportFile(f);
                e.target.value = '';
              }}
            />
            {importFile ? (
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle size={20} />
                <span className="font-medium">{importFile.name}</span>
                <span className="text-sm text-gray-500">({(importFile.size / 1024).toFixed(1)} Ko)</span>
              </div>
            ) : (
              <div>
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Cliquez pour selectionner un fichier CSV</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => { if (importFile) importMutation.mutate(importFile); }}
              disabled={!importFile || importMutation.isPending}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {importMutation.isPending ? 'Import en cours...' : 'Lancer l\'import'}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportFile(null); }}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Annuler
            </button>
          </div>

          {importMutation.isSuccess && importMutation.data && (
            <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-700 dark:text-green-300">
              <p className="font-medium">Resultat :</p>
              <p>{importMutation.data.created} creee(s), {importMutation.data.updated} mise(s) a jour, {importMutation.data.skipped} ignoree(s)</p>
              {importMutation.data.error_count > 0 && (
                <div className="mt-2 text-red-600 dark:text-red-400">
                  <p className="font-medium">{importMutation.data.error_count} erreur(s) :</p>
                  <ul className="list-disc pl-5 mt-1">
                    {importMutation.data.errors.map((err, i) => (
                      <li key={i}>Ligne {err.line}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
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
              <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">
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
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
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
          Erreur chargement marques: {extractApiError(error)}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <SortableHeader field="name" label="Nom" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                  <SortableHeader field="is_active" label="Actif" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.results.map((brand) => (
                  <tr key={brand.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{brand.name}</td>
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
                          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary"
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
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
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

      <ConfirmDialog
        open={!!brandToDelete}
        title="Supprimer cette marque ?"
        message={
          brandToDelete
            ? `La marque "${brandToDelete.name}" sera supprimee definitivement.`
            : ''
        }
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setBrandToDelete(null)}
        onConfirm={() => {
          if (!brandToDelete) return;
          deleteMutation.mutate({ id: brandToDelete.id, name: brandToDelete.name });
        }}
      />
    </div>
  );
}

