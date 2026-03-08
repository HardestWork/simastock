/** HRM — Employee Planning / Weekly Schedule page. */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Layout,
  Clock,
  Users,
  X,
} from 'lucide-react';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type {
  HrmShift,
  HrmScheduleEntry,
  HrmScheduleTemplate,
  HrmEmployeeList,
} from '@/api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

function weekLabel(monday: Date): string {
  return `Semaine du ${monday.getDate()} ${MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Sub-components (modals)
// ---------------------------------------------------------------------------

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const LABEL_CLS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const INPUT_CLS =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlanningPage() {
  const queryClient = useQueryClient();

  // Week navigation
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const weekStart = formatDate(monday);

  // View panels
  const [showShifts, setShowShifts] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Modals
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [copyWeekOpen, setCopyWeekOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);

  // Shift CRUD form
  const [shiftForm, setShiftForm] = useState({ name: '', start_time: '08:00', end_time: '17:00', color: '#3b82f6', is_active: true });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  // ---- Data queries -------------------------------------------------------

  const { data: weeklyEntries = [], isLoading: entriesLoading } = useQuery({
    queryKey: queryKeys.hrm.scheduleEntries.weekly(weekStart),
    queryFn: () => hrmApi.scheduleEntries.weeklyView({ week_start: weekStart }),
  });

  const { data: shiftsData } = useQuery({
    queryKey: queryKeys.hrm.shifts.list({}),
    queryFn: () => hrmApi.shifts.list({ page_size: '100' }),
  });
  const shifts: HrmShift[] = shiftsData?.results ?? [];

  const { data: employeesData } = useQuery({
    queryKey: queryKeys.hrm.employees.list({ status: 'ACTIVE', page_size: '200' }),
    queryFn: () => hrmApi.employees.list({ status: 'ACTIVE', page_size: '200' }),
  });
  const employees: HrmEmployeeList[] = employeesData?.results ?? [];

  const { data: templatesData } = useQuery({
    queryKey: queryKeys.hrm.scheduleTemplates.list({}),
    queryFn: () => hrmApi.scheduleTemplates.list({ page_size: '50' }),
  });
  const templates: HrmScheduleTemplate[] = templatesData?.results ?? [];

  // ---- Derived data: grid -------------------------------------------------

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  /** Map employee_id -> date_string -> entries[] */
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, HrmScheduleEntry[]>>();
    for (const entry of weeklyEntries) {
      if (!map.has(entry.employee)) map.set(entry.employee, new Map());
      const dayMap = map.get(entry.employee)!;
      const key = entry.date;
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(entry);
    }
    return map;
  }, [weeklyEntries]);

  /** Unique employees that appear in entries, plus any active employees */
  const gridEmployees = useMemo(() => {
    const empIds = new Set<string>();
    for (const entry of weeklyEntries) empIds.add(entry.employee);
    // Also include employees not scheduled yet (so manager can assign)
    for (const emp of employees) empIds.add(emp.id);
    // Build ordered list using employee data
    const empMap = new Map(employees.map((e) => [e.id, e]));
    // Entries may reference employees not in active list — include them too
    const entryNames = new Map(weeklyEntries.map((e) => [e.employee, e.employee_name]));
    const result: { id: string; name: string }[] = [];
    for (const id of empIds) {
      const emp = empMap.get(id);
      result.push({ id, name: emp ? emp.full_name : entryNames.get(id) ?? id });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [weeklyEntries, employees]);

  // ---- Mutations ----------------------------------------------------------

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.hrm.scheduleEntries.all });
  };

  // Apply template
  const [tplForm, setTplForm] = useState({ template_id: '', employee_ids: [] as string[], week_start: '' });

  const applyTemplateMut = useMutation({
    mutationFn: () =>
      hrmApi.scheduleEntries.applyTemplate({
        template_id: tplForm.template_id,
        employee_ids: tplForm.employee_ids,
        week_start: tplForm.week_start || weekStart,
      }),
    onSuccess: (res) => {
      toast.success(`${res.created} entree(s) creee(s)`);
      setApplyTemplateOpen(false);
      setTplForm({ template_id: '', employee_ids: [], week_start: '' });
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, 'Erreur lors de l\'application du modele')),
  });

  // Copy week
  const [copyForm, setCopyForm] = useState({ source_week_start: '', target_week_start: '' });

  const copyWeekMut = useMutation({
    mutationFn: () =>
      hrmApi.scheduleEntries.copyWeek({
        source_week_start: copyForm.source_week_start,
        target_week_start: copyForm.target_week_start,
      }),
    onSuccess: (res) => {
      toast.success(`${res.created} entree(s) copiee(s)`);
      setCopyWeekOpen(false);
      setCopyForm({ source_week_start: '', target_week_start: '' });
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, 'Erreur lors de la copie')),
  });

  // Add single entry
  const [entryForm, setEntryForm] = useState({ employee: '', shift: '', date: '' });

  const createEntryMut = useMutation({
    mutationFn: () =>
      hrmApi.scheduleEntries.create({
        employee: entryForm.employee,
        shift: entryForm.shift,
        date: entryForm.date,
      }),
    onSuccess: () => {
      toast.success('Entree ajoutee');
      setAddEntryOpen(false);
      setEntryForm({ employee: '', shift: '', date: '' });
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, 'Erreur lors de la creation')),
  });

  // Delete entry
  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => hrmApi.scheduleEntries.delete(id),
    onSuccess: () => {
      toast.success('Entree supprimee');
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, 'Suppression impossible')),
  });

  // Shift CRUD
  const createShiftMut = useMutation({
    mutationFn: () => hrmApi.shifts.create(shiftForm),
    onSuccess: () => {
      toast.success('Creneau cree');
      resetShiftForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.shifts.all });
    },
    onError: (err) => toast.error(extractApiError(err, 'Creation impossible')),
  });

  const updateShiftMut = useMutation({
    mutationFn: () => hrmApi.shifts.update(editingShiftId!, shiftForm),
    onSuccess: () => {
      toast.success('Creneau mis a jour');
      resetShiftForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.shifts.all });
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, 'Mise a jour impossible')),
  });

  const deleteShiftMut = useMutation({
    mutationFn: (id: string) => hrmApi.shifts.delete(id),
    onSuccess: () => {
      toast.success('Creneau supprime');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.shifts.all });
    },
    onError: (err) => toast.error(extractApiError(err, 'Suppression impossible')),
  });

  function resetShiftForm() {
    setShiftForm({ name: '', start_time: '08:00', end_time: '17:00', color: '#3b82f6', is_active: true });
    setEditingShiftId(null);
  }

  function startEditShift(s: HrmShift) {
    setShiftForm({ name: s.name, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), color: s.color, is_active: s.is_active });
    setEditingShiftId(s.id);
  }

  // ---- Template employee toggle helper ------------------------------------

  function toggleTplEmployee(empId: string) {
    setTplForm((prev) => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(empId)
        ? prev.employee_ids.filter((id) => id !== empId)
        : [...prev.employee_ids, empId],
    }));
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar size={24} /> Planning des employes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestion du planning hebdomadaire
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowShifts((v) => !v)} className={BTN_SECONDARY}>
            <Clock size={16} /> Gerer les creneaux
          </button>
          <button onClick={() => setShowTemplates((v) => !v)} className={BTN_SECONDARY}>
            <Layout size={16} /> Modeles
          </button>
          <button
            onClick={() => {
              setTplForm({ template_id: '', employee_ids: [], week_start: '' });
              setApplyTemplateOpen(true);
            }}
            className={BTN_SECONDARY}
          >
            <Layout size={16} /> Appliquer modele
          </button>
          <button
            onClick={() => {
              setCopyForm({ source_week_start: weekStart, target_week_start: '' });
              setCopyWeekOpen(true);
            }}
            className={BTN_SECONDARY}
          >
            <Copy size={16} /> Copier semaine
          </button>
          <button
            onClick={() => {
              setEntryForm({ employee: '', shift: '', date: '' });
              setAddEntryOpen(true);
            }}
            className={BTN_PRIMARY}
          >
            <Plus size={16} /> Ajouter entree
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm">
        <button
          onClick={() => setMonday((prev) => addDays(prev, -7))}
          className="rounded-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <span className="text-lg font-semibold text-gray-900 dark:text-white">{weekLabel(monday)}</span>
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            {formatDate(monday)} &mdash; {formatDate(addDays(monday, 6))}
          </span>
        </div>
        <button
          onClick={() => setMonday((prev) => addDays(prev, 7))}
          className="rounded-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Weekly grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        {entriesLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
            Chargement...
          </div>
        ) : gridEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-2">
            <Users size={32} />
            <p>Aucun employe trouve. Ajoutez des employes pour commencer.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 min-w-[180px]">
                  Employe
                </th>
                {weekDates.map((d, i) => (
                  <th
                    key={i}
                    className="px-2 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 min-w-[130px]"
                  >
                    <div>{DAYS[i]}</div>
                    <div className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      {d.getDate()}/{d.getMonth() + 1}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridEmployees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-4 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {emp.name}
                  </td>
                  {weekDates.map((d, i) => {
                    const key = formatDate(d);
                    const dayEntries = grid.get(emp.id)?.get(key) ?? [];
                    return (
                      <td key={i} className="px-1 py-1 align-top">
                        {dayEntries.length > 0 ? (
                          dayEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="group relative mb-1 rounded-lg px-2 py-1.5 text-xs font-medium text-white shadow-sm cursor-default"
                              style={{ backgroundColor: entry.shift_color || '#6b7280' }}
                            >
                              <div className="truncate">{entry.shift_name}</div>
                              <div className="text-[10px] opacity-80">
                                {shifts.find((s) => s.id === entry.shift)
                                  ? `${shifts.find((s) => s.id === entry.shift)!.start_time.slice(0, 5)} - ${shifts.find((s) => s.id === entry.shift)!.end_time.slice(0, 5)}`
                                  : ''}
                              </div>
                              <button
                                onClick={() => deleteEntryMut.mutate(entry.id)}
                                className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] hover:bg-red-600 transition"
                                title="Supprimer"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="h-10 rounded-lg border border-dashed border-gray-200 dark:border-gray-700" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Side panel: Shifts (Creneaux) CRUD                                 */}
      {/* ------------------------------------------------------------------ */}
      {showShifts && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock size={20} /> Creneaux (Shifts)
            </h2>
            <button onClick={() => setShowShifts(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Shift form */}
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>Nom</label>
                <input
                  className={INPUT_CLS}
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Matin"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Debut</label>
                <input
                  type="time"
                  className={INPUT_CLS}
                  value={shiftForm.start_time}
                  onChange={(e) => setShiftForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Fin</label>
                <input
                  type="time"
                  className={INPUT_CLS}
                  value={shiftForm.end_time}
                  onChange={(e) => setShiftForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Couleur</label>
                <input
                  type="color"
                  className="h-[38px] w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 p-1"
                  value={shiftForm.color}
                  onChange={(e) => setShiftForm((f) => ({ ...f, color: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                {editingShiftId ? (
                  <>
                    <button
                      className={BTN_PRIMARY}
                      disabled={updateShiftMut.isPending}
                      onClick={() => updateShiftMut.mutate()}
                    >
                      Modifier
                    </button>
                    <button className={BTN_SECONDARY} onClick={resetShiftForm}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    className={BTN_PRIMARY}
                    disabled={!shiftForm.name || createShiftMut.isPending}
                    onClick={() => createShiftMut.mutate()}
                  >
                    <Plus size={14} /> Creer
                  </button>
                )}
              </div>
            </div>

            {/* Shift list */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {shifts.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  Aucun creneau defini.
                </div>
              )}
              {shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full border border-gray-200 dark:border-gray-600" style={{ backgroundColor: s.color }} />
                    <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                    </span>
                    {!s.is_active && (
                      <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Inactif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => startEditShift(s)}
                    >
                      Modifier
                    </button>
                    <button
                      className="text-sm text-red-600 dark:text-red-400 hover:underline"
                      onClick={() => {
                        if (window.confirm('Supprimer ce creneau ?')) deleteShiftMut.mutate(s.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Side panel: Templates (Modeles)                                    */}
      {/* ------------------------------------------------------------------ */}
      {showTemplates && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Layout size={20} /> Modeles de planning
            </h2>
            <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {templates.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Aucun modele defini.
              </div>
            ) : (
              templates.map((tpl) => (
                <div key={tpl.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{tpl.name}</h3>
                    {!tpl.is_active && (
                      <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Inactif
                      </span>
                    )}
                  </div>
                  {tpl.lines.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Aucune ligne definie.</p>
                  ) : (
                    <div className="grid grid-cols-7 gap-1 text-xs">
                      {DAYS.map((day, i) => {
                        const linesForDay = tpl.lines.filter((l) => l.day_of_week === i);
                        return (
                          <div key={i} className="text-center">
                            <div className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{day}</div>
                            {linesForDay.length > 0 ? (
                              linesForDay.map((l) => (
                                <div key={l.id} className="rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1 py-0.5 mb-0.5">
                                  {l.shift_name}
                                </div>
                              ))
                            ) : (
                              <div className="text-gray-300 dark:text-gray-600">—</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Modals                                                             */}
      {/* ================================================================== */}

      {/* Apply template modal */}
      {applyTemplateOpen && (
        <ModalShell title="Appliquer un modele" onClose={() => setApplyTemplateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Modele</label>
              <select
                className={INPUT_CLS}
                value={tplForm.template_id}
                onChange={(e) => setTplForm((f) => ({ ...f, template_id: e.target.value }))}
              >
                <option value="">-- Choisir un modele --</option>
                {templates.filter((t) => t.is_active).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLS}>Semaine cible</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={tplForm.week_start || weekStart}
                onChange={(e) => setTplForm((f) => ({ ...f, week_start: e.target.value }))}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Employes</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tplForm.employee_ids.includes(emp.id)}
                      onChange={() => toggleTplEmployee(emp.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">{emp.full_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button className={BTN_SECONDARY} onClick={() => setApplyTemplateOpen(false)}>
                Annuler
              </button>
              <button
                className={BTN_PRIMARY}
                disabled={!tplForm.template_id || tplForm.employee_ids.length === 0 || applyTemplateMut.isPending}
                onClick={() => applyTemplateMut.mutate()}
              >
                {applyTemplateMut.isPending ? 'Application...' : 'Appliquer'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Copy week modal */}
      {copyWeekOpen && (
        <ModalShell title="Copier une semaine" onClose={() => setCopyWeekOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Semaine source</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={copyForm.source_week_start}
                onChange={(e) => setCopyForm((f) => ({ ...f, source_week_start: e.target.value }))}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Semaine cible</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={copyForm.target_week_start}
                onChange={(e) => setCopyForm((f) => ({ ...f, target_week_start: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={BTN_SECONDARY} onClick={() => setCopyWeekOpen(false)}>
                Annuler
              </button>
              <button
                className={BTN_PRIMARY}
                disabled={!copyForm.source_week_start || !copyForm.target_week_start || copyWeekMut.isPending}
                onClick={() => copyWeekMut.mutate()}
              >
                {copyWeekMut.isPending ? 'Copie...' : 'Copier'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Add entry modal */}
      {addEntryOpen && (
        <ModalShell title="Ajouter une entree" onClose={() => setAddEntryOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Employe</label>
              <select
                className={INPUT_CLS}
                value={entryForm.employee}
                onChange={(e) => setEntryForm((f) => ({ ...f, employee: e.target.value }))}
              >
                <option value="">-- Choisir un employe --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Creneau</label>
              <select
                className={INPUT_CLS}
                value={entryForm.shift}
                onChange={(e) => setEntryForm((f) => ({ ...f, shift: e.target.value }))}
              >
                <option value="">-- Choisir un creneau --</option>
                {shifts.filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Date</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={entryForm.date}
                onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={BTN_SECONDARY} onClick={() => setAddEntryOpen(false)}>
                Annuler
              </button>
              <button
                className={BTN_PRIMARY}
                disabled={!entryForm.employee || !entryForm.shift || !entryForm.date || createEntryMut.isPending}
                onClick={() => createEntryMut.mutate()}
              >
                {createEntryMut.isPending ? 'Creation...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
