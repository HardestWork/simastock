/** Customer list page with search. */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import { useAuthStore } from '@/auth/auth-store';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import { Search, Plus, Upload, AlertCircle, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import type { CsvImportResult } from '@/api/types';

const PAGE_SIZE = 25;

export default function CustomerListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('last_name', 'asc');
  const role = useAuthStore((s) => s.user?.role);
  const canImportCsv = role === 'ADMIN' || role === 'MANAGER';

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (debouncedSearch) params.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => customerApi.list(params),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => customerApi.importCsv(file),
    onSuccess: (result) => {
      toast.success('Import CSV termine avec succes');
      setImportResult(result);
      setImportError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Erreur lors de l\'import CSV');
      const ax = err as AxiosError<Record<string, unknown> | string>;
      const data = ax?.response?.data;
      if (typeof data === 'string') {
        setImportError(data);
      } else if (data && typeof data.detail === 'string') {
        setImportError(data.detail);
      } else if (data && typeof data.file === 'string') {
        setImportError(data.file);
      } else {
        setImportError("Import CSV impossible.");
      }
    },
  });

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCsv('customers/export-csv/', 'clients')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
          <Link
            to="/customers/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={18} />
            Nouveau client
          </Link>
        </div>
      </div>

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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom ou telephone..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <SortableHeader field="last_name" label="Nom" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Telephone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Structure</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => navigate('/customers/' + customer.id)}
                  className="border-b border-gray-50 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3 font-medium">{customer.full_name}</td>
                  <td className="px-4 py-3">{customer.phone || '\u2014'}</td>
                  <td className="px-4 py-3">{customer.email || '\u2014'}</td>
                  <td className="px-4 py-3">{customer.company || '\u2014'}</td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun client trouve.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
