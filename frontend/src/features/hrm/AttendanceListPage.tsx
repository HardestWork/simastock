/** HRM - Attendance dashboard with daily summary, live view, and record management. */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Search,
  Plus,
  Users,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UserCheck,
  UserX,
  AlertTriangle,
  Timer,
  LogIn,
  LogOut,
  Pencil,
  X,
  Check,
  Palmtree,
} from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import type { HrmAttendanceStatus, HrmAttendance } from '@/api/types';

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
  PRESENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ABSENT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  LATE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  HALF_DAY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ON_LEAVE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  HOLIDAY: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '-';
  return new Date(isoStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function workedTime(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '-';
  const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (diffMs <= 0) return '-';
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceListPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<HrmAttendance>>({});

  const [form, setForm] = useState({
    employee: '',
    date: todayStr(),
    status: 'PRESENT' as HrmAttendanceStatus,
    check_in: '',
    check_out: '',
    notes: '',
  });

  const [bulkForm, setBulkForm] = useState({
    date: todayStr(),
    check_in: '',
    employee_ids: [] as string[],
  });

  const debouncedSearch = useDebounce(search, 300);
  const isToday = selectedDate === todayStr();

  // Daily summary
  const { data: summary } = useQuery({
    queryKey: queryKeys.hrm.attendances.dailySummary(selectedDate),
    queryFn: () => hrmApi.attendances.dailySummary(selectedDate),
    refetchInterval: isToday ? 30_000 : false,
  });

  // Attendance list
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
    ordering: '-check_in',
    date: selectedDate,
    ...(debouncedSearch && { search: debouncedSearch }),
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.hrm.attendances.all });
  };

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
      setForm({ employee: '', date: todayStr(), status: 'PRESENT', check_in: '', check_out: '', notes: '' });
      invalidateAll();
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
      setBulkForm({ date: todayStr(), check_in: '', employee_ids: [] });
      invalidateAll();
    },
    onError: (error) => toast.error(extractApiError(error, 'Check-in en masse impossible')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrmApi.attendances.delete(id),
    onSuccess: () => {
      toast.success('Pointage supprime');
      invalidateAll();
    },
    onError: () => toast.error('Impossible de supprimer ce pointage'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HrmAttendance> }) =>
      hrmApi.attendances.update(id, data),
    onSuccess: () => {
      toast.success('Pointage mis a jour');
      setEditingId(null);
      invalidateAll();
    },
    onError: (error) => toast.error(extractApiError(error, 'Modification impossible')),
  });

  const items = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;
  const employees = employeesQuery.data?.results ?? [];

  const toggleEmployee = (employeeId: string) => {
    setBulkForm((prev) => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(employeeId)
        ? prev.employee_ids.filter((id) => id !== employeeId)
        : [...prev.employee_ids, employeeId],
    }));
  };

  const selectAllEmployees = () => {
    setBulkForm((prev) => ({
      ...prev,
      employee_ids: prev.employee_ids.length === employees.length ? [] : employees.map((e) => e.id),
    }));
  };

  const startEdit = (attendance: HrmAttendance) => {
    setEditingId(attendance.id);
    setEditForm({
      check_in: attendance.check_in ? attendance.check_in.slice(0, 16) : '',
      check_out: attendance.check_out ? attendance.check_out.slice(0, 16) : '',
      status: attendance.status,
      notes: attendance.notes,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMut.mutate({
      id: editingId,
      data: {
        check_in: toIsoOrNull(editForm.check_in as string || ''),
        check_out: toIsoOrNull(editForm.check_out as string || ''),
        status: editForm.status,
        notes: editForm.notes,
      },
    });
  };

  // Stat cards data
  const stats = useMemo(() => {
    if (!summary) return null;
    return [
      {
        label: 'Presents',
        value: summary.present,
        total: summary.total_employees,
        icon: UserCheck,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        border: 'border-emerald-200 dark:border-emerald-800',
      },
      {
        label: 'Absents',
        value: summary.absent,
        total: summary.total_employees,
        icon: UserX,
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
      },
      {
        label: 'En retard',
        value: summary.late,
        total: summary.present,
        icon: AlertTriangle,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-200 dark:border-amber-800',
      },
      {
        label: 'En conge',
        value: summary.on_leave,
        total: summary.total_employees,
        icon: Palmtree,
        color: 'text-purple-600 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-purple-200 dark:border-purple-800',
      },
      {
        label: 'Encore sur site',
        value: summary.still_in,
        total: summary.present,
        icon: LogIn,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
      },
      {
        label: 'Partis',
        value: summary.checked_out,
        total: summary.present,
        icon: LogOut,
        color: 'text-gray-600 dark:text-gray-400',
        bg: 'bg-gray-50 dark:bg-gray-800',
        border: 'border-gray-200 dark:border-gray-700',
      },
    ];
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock size={24} /> Pointage
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Suivi des presences et heures de travail
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition"
          >
            <Plus size={16} /> Nouveau
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

      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setSelectedDate((d) => shiftDate(d, -1)); setPage(1); }}
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          onClick={() => { setSelectedDate((d) => shiftDate(d, 1)); setPage(1); }}
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
        {!isToday && (
          <button
            onClick={() => { setSelectedDate(todayStr()); setPage(1); }}
            className="rounded-lg px-3 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
          >
            Aujourd'hui
          </button>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
          {formatDate(selectedDate)}
          {isToday && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> En direct</span>}
        </span>
      </div>

      {/* Dashboard cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <s.icon size={20} className={s.color} />
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
              </div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{s.label}</p>
              {s.total > 0 && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${s.color.includes('emerald') ? 'bg-emerald-500' : s.color.includes('red') ? 'bg-red-500' : s.color.includes('amber') ? 'bg-amber-500' : s.color.includes('purple') ? 'bg-purple-500' : s.color.includes('blue') ? 'bg-blue-500' : 'bg-gray-500'}`}
                      style={{ width: `${Math.min(100, (s.value / s.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.value}/{s.total}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Extra stats row */}
      {summary && (summary.avg_late_minutes > 0 || summary.total_overtime_minutes > 0) && (
        <div className="flex gap-4 flex-wrap">
          {summary.avg_late_minutes > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2">
              <Timer size={16} className="text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-400">
                Retard moyen : <strong>{summary.avg_late_minutes} min</strong>
              </span>
            </div>
          )}
          {summary.total_overtime_minutes > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-2">
              <Timer size={16} className="text-blue-600" />
              <span className="text-sm text-blue-700 dark:text-blue-400">
                Heures sup. totales : <strong>{Math.floor(summary.total_overtime_minutes / 60)}h{String(summary.total_overtime_minutes % 60).padStart(2, '0')}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recent activity (today only) */}
      {isToday && summary?.recent_activity && summary.recent_activity.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Clock size={16} /> Activite recente
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {summary.recent_activity.map((a) => (
              <div
                key={a.id}
                className="flex-shrink-0 flex items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 px-4 py-2.5 border border-gray-100 dark:border-gray-700"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                  a.check_out ? 'bg-orange-500' : a.status === 'LATE' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}>
                  {a.employee_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{a.employee_name}</p>
                  <p className="text-xs text-gray-500">
                    {a.check_out ? (
                      <span className="text-orange-600 dark:text-orange-400">Depart {formatTime(a.check_out)}</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Arrivee {formatTime(a.check_in)}</span>
                    )}
                    {a.late_minutes > 0 && (
                      <span className="ml-1.5 text-amber-600">+{a.late_minutes}min</span>
                    )}
                    {a.check_in_method && (
                      <span className="ml-1.5 text-gray-400">{a.check_in_method}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {createOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Ajouter un pointage</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Arrivee</label>
              <input
                type="datetime-local"
                value={form.check_in}
                onChange={(e) => setForm((prev) => ({ ...prev, check_in: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Depart</label>
              <input
                type="datetime-local"
                value={form.check_out}
                onChange={(e) => setForm((prev) => ({ ...prev, check_out: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notes..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!form.employee || !form.date) {
                  toast.error('Employe et date sont obligatoires.');
                  return;
                }
                createMut.mutate();
              }}
              disabled={createMut.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {createMut.isPending ? 'Creation...' : 'Creer'}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Bulk check-in form */}
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

          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{bulkForm.employee_ids.length}/{employees.length} selectionne(s)</span>
              <button
                type="button"
                onClick={selectAllEmployees}
                className="text-xs text-primary hover:underline"
              >
                {bulkForm.employee_ids.length === employees.length ? 'Tout deselectionner' : 'Tout selectionner'}
              </button>
            </div>
            <div className="max-h-52 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {employees.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-500">Aucun employe actif.</p>
              ) : (
                employees.map((employee) => {
                  const checked = bulkForm.employee_ids.includes(employee.id);
                  return (
                    <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <input type="checkbox" checked={checked} onChange={() => toggleEmployee(employee.id)} className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{employee.full_name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!bulkForm.date) { toast.error('La date est obligatoire.'); return; }
                if (!bulkForm.employee_ids.length) { toast.error('Selectionne au moins un employe.'); return; }
                bulkMut.mutate();
              }}
              disabled={bulkMut.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {bulkMut.isPending ? 'Traitement...' : `Pointer ${bulkForm.employee_ids.length} employe(s)`}
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABELS) as HrmAttendanceStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {data && (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            {data.count} enregistrement(s)
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employe</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrivee</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depart</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Travaille</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retard</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">H. Sup.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    Chargement...
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <UserX size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">Aucun pointage pour cette date.</p>
                </td>
              </tr>
            ) : (
              items.map((attendance) => {
                const isEditing = editingId === attendance.id;
                return (
                  <tr key={attendance.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                          attendance.check_out ? 'bg-gray-400' : attendance.status === 'LATE' ? 'bg-amber-500' : attendance.status === 'PRESENT' ? 'bg-emerald-500' : 'bg-red-400'
                        }`}>
                          {(attendance.employee_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{attendance.employee_name}</p>
                          {attendance.check_in_method && (
                            <p className="text-xs text-gray-400">{attendance.check_in_method}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <input
                          type="datetime-local"
                          value={editForm.check_in as string || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, check_in: e.target.value }))}
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white w-44"
                        />
                      ) : (
                        <span className={attendance.check_in ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}>
                          {formatTime(attendance.check_in)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <input
                          type="datetime-local"
                          value={editForm.check_out as string || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, check_out: e.target.value }))}
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white w-44"
                        />
                      ) : (
                        <span className={attendance.check_out ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}>
                          {formatTime(attendance.check_out)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {workedTime(attendance.check_in, attendance.check_out)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {attendance.late_minutes > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle size={12} />
                          {attendance.late_minutes} min
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {attendance.overtime_minutes > 0 ? (
                        <span className="text-blue-600 font-medium">{attendance.overtime_minutes} min</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.status as string}
                          onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as HrmAttendanceStatus }))}
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                        >
                          {(Object.keys(STATUS_LABELS) as HrmAttendanceStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[attendance.status]}`}>
                          {STATUS_LABELS[attendance.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={updateMut.isPending}
                            className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
                            title="Sauvegarder"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            title="Annuler"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(attendance)}
                            className="rounded p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Supprimer le pointage de ${attendance.employee_name} ?`))
                                deleteMut.mutate(attendance.id);
                            }}
                            className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}
