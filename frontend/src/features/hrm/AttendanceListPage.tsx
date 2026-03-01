/** HRM - Attendance tracking page with list + create actions. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Search, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import type { HrmAttendanceStatus } from '@/api/types';

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<HrmAttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'En retard',
  HALF_DAY: 'Demi-journee',
  ON_LEAVE: 'En conge',
  HOLIDAY: 'Jour ferie',
};

const STATUS_COLORS: Record<HrmAttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  HALF_DAY: 'bg-blue-100 text-blue-800',
  ON_LEAVE: 'bg-purple-100 text-purple-800',
  HOLIDAY: 'bg-cyan-100 text-cyan-800',
};

function extractApiError(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const firstValue = data[firstKey];
  if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;
  return fallback;
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function AttendanceListPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [form, setForm] = useState({
    employee: '',
    date: '',
    status: 'PRESENT' as HrmAttendanceStatus,
    check_in: '',
    check_out: '',
    notes: '',
  });

  const [bulkForm, setBulkForm] = useState({
    date: '',
    check_in: '',
    employee_ids: [] as string[],
  });

  const debouncedSearch = useDebounce(search, 300);

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
    ordering: '-date',
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateFilter && { date: dateFilter }),
    ...(statusFilter && { status: statusFilter }),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hrm.attendances.list(params),
    queryFn: () => hrmApi.attendances.list(params),
  });

  const employeesQuery = useQuery({
    queryKey: queryKeys.hrm.employees.list({ page_size: '200', ordering: 'last_name,first_name', status: 'ACTIVE' }),
    queryFn: () => hrmApi.employees.list({ page_size: '200', ordering: 'last_name,first_name', status: 'ACTIVE' }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      hrmApi.attendances.create({
        employee: form.employee,
        date: form.date,
        status: form.status,
        check_in: toIsoOrNull(form.check_in),
        check_out: toIsoOrNull(form.check_out),
        notes: form.notes,
      }),
    onSuccess: () => {
      toast.success('Pointage ajoute');
      setCreateOpen(false);
      setForm({ employee: '', date: '', status: 'PRESENT', check_in: '', check_out: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.attendances.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Creation du pointage impossible')),
  });

  const bulkMut = useMutation({
    mutationFn: () =>
      hrmApi.attendances.bulkCheckin({
        employee_ids: bulkForm.employee_ids,
        date: bulkForm.date,
        check_in: toIsoOrNull(bulkForm.check_in) || undefined,
      }),
    onSuccess: (result) => {
      const createdCount = (result as { created?: number })?.created ?? 0;
      toast.success(`${createdCount} pointage(s) cree(s)`);
      setBulkOpen(false);
      setBulkForm({ date: '', check_in: '', employee_ids: [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.attendances.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Check-in en masse impossible')),
  });

  const items = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;
  const employees = employeesQuery.data?.results ?? [];

  const toggleEmployee = (employeeId: string) => {
    setBulkForm((prev) => {
      const exists = prev.employee_ids.includes(employeeId);
      return {
        ...prev,
        employee_ids: exists
          ? prev.employee_ids.filter((id) => id !== employeeId)
          : [...prev.employee_ids, employeeId],
      };
    });
  };

  const submitCreate = () => {
    if (!form.employee || !form.date) {
      toast.error('Employe et date sont obligatoires.');
      return;
    }
    createMut.mutate();
  };

  const submitBulk = () => {
    if (!bulkForm.date) {
      toast.error('La date est obligatoire pour le check-in en masse.');
      return;
    }
    if (!bulkForm.employee_ids.length) {
      toast.error('Selectionne au moins un employe.');
      return;
    }
    bulkMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock size={24} /> Pointage
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data ? `${data.count} pointage(s)` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition"
          >
            <Plus size={16} /> Nouveau pointage
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition"
          >
            <Users size={16} /> Check-in masse
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Ajouter un pointage</h2>
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
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as HrmAttendanceStatus }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {(Object.keys(STATUS_LABELS) as HrmAttendanceStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <input
              type="datetime-local"
              value={form.check_in}
              onChange={(e) => setForm((prev) => ({ ...prev, check_in: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <input
              type="datetime-local"
              value={form.check_out}
              onChange={(e) => setForm((prev) => ({ ...prev, check_out: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />

            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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

      {bulkOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Check-in en masse</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={bulkForm.date}
              onChange={(e) => setBulkForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <input
              type="datetime-local"
              value={bulkForm.check_in}
              onChange={(e) => setBulkForm((prev) => ({ ...prev, check_in: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <div className="mt-3 max-h-52 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
            {employees.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-500">Aucun employe actif.</p>
            ) : (
              employees.map((employee) => {
                const checked = bulkForm.employee_ids.includes(employee.id);
                return (
                  <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmployee(employee.id)}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">{employee.full_name} ({employee.employee_number})</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submitBulk}
              disabled={bulkMut.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {bulkMut.isPending ? 'Traitement...' : 'Executer'}
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
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
            placeholder="Rechercher par nom..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABELS) as HrmAttendanceStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employe</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Arrivee</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Depart</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Retard (min)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Heures sup. (min)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
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
                  Aucun pointage trouve.
                </td>
              </tr>
            ) : (
              items.map((attendance) => (
                <tr key={attendance.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{attendance.employee_name}</td>
                  <td className="px-4 py-3 text-sm">{attendance.date}</td>
                  <td className="px-4 py-3 text-sm">
                    {attendance.check_in
                      ? new Date(attendance.check_in).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {attendance.check_out
                      ? new Date(attendance.check_out).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {attendance.late_minutes > 0 ? <span className="text-amber-600 font-medium">{attendance.late_minutes}</span> : '0'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {attendance.overtime_minutes > 0 ? <span className="text-blue-600 font-medium">{attendance.overtime_minutes}</span> : '0'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[attendance.status]}`}>
                      {STATUS_LABELS[attendance.status]}
                    </span>
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
