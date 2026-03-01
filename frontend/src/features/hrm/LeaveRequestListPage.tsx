/** HRM - Leave request management page with create + approve/reject actions. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Search, Check, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';

const PAGE_SIZE = 25;

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvee',
  REJECTED: 'Refusee',
  CANCELLED: 'Annulee',
};

function extractApiError(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) return String(data.non_field_errors[0]);
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const firstValue = data[firstKey];
  if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;
  return fallback;
}

function calcDaysInclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export default function LeaveRequestListPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    employee: '',
    leave_type: '',
    start_date: '',
    end_date: '',
    days_requested: '',
    reason: '',
  });

  const debouncedSearch = useDebounce(search, 300);

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter && { status: statusFilter }),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hrm.leaveRequests.list(params),
    queryFn: () => hrmApi.leaveRequests.list(params),
  });

  const employeesQuery = useQuery({
    queryKey: queryKeys.hrm.employees.list({ page_size: '200', ordering: 'last_name,first_name', status: 'ACTIVE' }),
    queryFn: () => hrmApi.employees.list({ page_size: '200', ordering: 'last_name,first_name', status: 'ACTIVE' }),
  });

  const leaveTypesQuery = useQuery({
    queryKey: queryKeys.hrm.leaveTypes.list({ page_size: '200', is_active: 'true' }),
    queryFn: () => hrmApi.leaveTypes.list({ page_size: '200', is_active: 'true' }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      hrmApi.leaveRequests.create({
        employee: form.employee,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: form.days_requested || String(calcDaysInclusive(form.start_date, form.end_date)),
        reason: form.reason,
      }),
    onSuccess: () => {
      toast.success('Demande de conge creee');
      setCreateOpen(false);
      setForm({
        employee: '',
        leave_type: '',
        start_date: '',
        end_date: '',
        days_requested: '',
        reason: '',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.leaveRequests.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Creation de la demande impossible')),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => hrmApi.leaveRequests.approve(id),
    onSuccess: () => {
      toast.success('Demande approuvee');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.leaveRequests.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Erreur lors de l\'approbation')),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => hrmApi.leaveRequests.reject(id),
    onSuccess: () => {
      toast.success('Demande rejetee');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.leaveRequests.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Erreur lors du rejet')),
  });

  const items = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;
  const employees = employeesQuery.data?.results ?? [];
  const leaveTypes = leaveTypesQuery.data?.results ?? [];

  const submitCreate = () => {
    if (!form.employee || !form.leave_type || !form.start_date || !form.end_date) {
      toast.error('Employe, type, date debut et date fin sont obligatoires.');
      return;
    }
    const suggestedDays = calcDaysInclusive(form.start_date, form.end_date);
    if (suggestedDays <= 0) {
      toast.error('Les dates sont invalides.');
      return;
    }
    createMut.mutate();
  };

  const suggestedDays = calcDaysInclusive(form.start_date, form.end_date);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar size={24} /> Demandes de conge
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data ? `${data.count} demande(s)` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition"
        >
          <Plus size={16} /> Nouvelle demande
        </button>
      </div>

      {createOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Ajouter une demande de conge</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={form.employee}
              onChange={(e) => setForm((prev) => ({ ...prev, employee: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="">Selectionner un employe</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_number})
                </option>
              ))}
            </select>

            <select
              value={form.leave_type}
              onChange={(e) => setForm((prev) => ({ ...prev, leave_type: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="">Selectionner un type de conge</option>
              {leaveTypes.map((leaveType) => (
                <option key={leaveType.id} value={leaveType.id}>
                  {leaveType.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  start_date: e.target.value,
                  days_requested: prev.days_requested || String(calcDaysInclusive(e.target.value, prev.end_date) || ''),
                }))
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <input
              type="date"
              value={form.end_date}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  end_date: e.target.value,
                  days_requested: prev.days_requested || String(calcDaysInclusive(prev.start_date, e.target.value) || ''),
                }))
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <input
              type="number"
              min="0.5"
              step="0.5"
              value={form.days_requested}
              onChange={(e) => setForm((prev) => ({ ...prev, days_requested: e.target.value }))}
              placeholder="Nombre de jours"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              Suggestion automatique: {suggestedDays > 0 ? `${suggestedDays} jour(s)` : '-'}
            </div>

            <textarea
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Motif"
              rows={3}
              className="sm:col-span-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submitCreate}
              disabled={createMut.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {createMut.isPending ? 'Creation...' : 'Creer'}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom d'employe..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employe</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Du</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Au</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Jours</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    Chargement...
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  Aucune demande de conge trouvee.
                </td>
              </tr>
            ) : (
              items.map((leaveRequest) => (
                <tr key={leaveRequest.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{leaveRequest.employee_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{leaveRequest.leave_type_name}</td>
                  <td className="px-4 py-3 text-sm">{leaveRequest.start_date}</td>
                  <td className="px-4 py-3 text-sm">{leaveRequest.end_date}</td>
                  <td className="px-4 py-3 text-sm">{leaveRequest.days_requested}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[leaveRequest.status] ?? ''}`}>
                      {STATUS_LABELS[leaveRequest.status] ?? leaveRequest.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {leaveRequest.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => approveMut.mutate(leaveRequest.id)}
                          disabled={approveMut.isPending}
                          title="Approuver"
                          className="rounded-md bg-emerald-500 p-1.5 text-white hover:bg-emerald-600 transition"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => rejectMut.mutate(leaveRequest.id)}
                          disabled={rejectMut.isPending}
                          title="Rejeter"
                          className="rounded-md bg-red-500 p-1.5 text-white hover:bg-red-600 transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}
