/** HRM — Organisation page: manage Departments, Positions & Attendance Policies. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Briefcase,
  Clock,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Users,
  ChevronRight,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import type { HrmDepartment, HrmPosition, HrmAttendancePolicy } from '@/api/types';

type Tab = 'departments' | 'positions' | 'policies';

// ─── Department Form Modal ──────────────────────────────────────────────────

function DepartmentModal({
  department,
  departments,
  onClose,
}: {
  department: HrmDepartment | null;
  departments: HrmDepartment[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!department;

  const [form, setForm] = useState({
    name: department?.name ?? '',
    code: department?.code ?? '',
    parent: department?.parent ?? '',
    is_active: department?.is_active ?? true,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit
        ? hrmApi.departments.update(department!.id, { ...data, parent: data.parent || null })
        : hrmApi.departments.create({ ...data, parent: data.parent || null }),
    onSuccess: () => {
      toast.success(isEdit ? 'Departement modifie' : 'Departement cree');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.departments.all });
      onClose();
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Modifier le departement' : 'Nouveau departement'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex: Ventes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex: VNT"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Departement parent
            </label>
            <select
              value={form.parent}
              onChange={(e) => setForm({ ...form, parent: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="">Aucun (racine)</option>
              {departments
                .filter((d) => d.id !== department?.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            Actif
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || !form.code || mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Modifier' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Position Form Modal ────────────────────────────────────────────────────

function PositionModal({
  position,
  departments,
  onClose,
}: {
  position: HrmPosition | null;
  departments: HrmDepartment[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!position;

  const [form, setForm] = useState({
    title: position?.title ?? '',
    code: position?.code ?? '',
    department: position?.department ?? '',
    min_salary: position?.min_salary ?? '0',
    max_salary: position?.max_salary ?? '0',
    is_active: position?.is_active ?? true,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit
        ? hrmApi.positions.update(position!.id, { ...data, department: data.department || null })
        : hrmApi.positions.create({ ...data, department: data.department || null }),
    onSuccess: () => {
      toast.success(isEdit ? 'Poste modifie' : 'Poste cree');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.positions.all });
      onClose();
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Modifier le poste' : 'Nouveau poste'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Intitule *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex: Vendeur senior"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex: VND-SR"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Departement</label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="">Aucun</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salaire min (FCFA)
              </label>
              <input
                type="number"
                value={form.min_salary}
                onChange={(e) => setForm({ ...form, min_salary: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salaire max (FCFA)
              </label>
              <input
                type="number"
                value={form.max_salary}
                onChange={(e) => setForm({ ...form, max_salary: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            Actif
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!form.title || !form.code || mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Modifier' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance Policy Form Modal ────────────────────────────────────────────

function PolicyModal({
  policy,
  departments,
  onClose,
}: {
  policy: HrmAttendancePolicy | null;
  departments: HrmDepartment[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!policy;

  const [form, setForm] = useState({
    name: policy?.name ?? '',
    department: policy?.department ?? '',
    work_start: policy?.work_start ?? '08:00',
    work_end: policy?.work_end ?? '17:00',
    break_minutes: policy?.break_minutes ?? 60,
    late_tolerance_minutes: policy?.late_tolerance_minutes ?? 15,
    is_default: policy?.is_default ?? false,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit
        ? hrmApi.attendancePolicies.update(policy!.id, { ...data, department: data.department || null })
        : hrmApi.attendancePolicies.create({ ...data, department: data.department || null }),
    onSuccess: () => {
      toast.success(isEdit ? 'Politique modifiee' : 'Politique creee');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.attendancePolicies.all });
      onClose();
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Modifier la politique' : 'Nouvelle politique horaire'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex: Horaire standard"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Departement</label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="">Tous (entreprise entiere)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Heure d'arrivee *
              </label>
              <input
                type="time"
                value={form.work_start}
                onChange={(e) => setForm({ ...form, work_start: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Heure de depart *
              </label>
              <input
                type="time"
                value={form.work_end}
                onChange={(e) => setForm({ ...form, work_end: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Pause (minutes)
              </label>
              <input
                type="number"
                min={0}
                value={form.break_minutes}
                onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tolerance retard (min)
              </label>
              <input
                type="number"
                min={0}
                value={form.late_tolerance_minutes}
                onChange={(e) => setForm({ ...form, late_tolerance_minutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="rounded border-gray-300"
            />
            Politique par defaut
          </label>
          <p className="text-xs text-gray-400">
            La politique par defaut s'applique a tous les employes sans politique specifique.
          </p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || !form.work_start || !form.work_end || mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Modifier' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function OrganisationPage() {
  const [tab, setTab] = useState<Tab>('departments');
  const [deptModal, setDeptModal] = useState<{ open: boolean; dept: HrmDepartment | null }>({ open: false, dept: null });
  const [posModal, setPosModal] = useState<{ open: boolean; pos: HrmPosition | null }>({ open: false, pos: null });
  const [polModal, setPolModal] = useState<{ open: boolean; pol: HrmAttendancePolicy | null }>({ open: false, pol: null });
  const qc = useQueryClient();

  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: queryKeys.hrm.departments.list({ page_size: '200' }),
    queryFn: () => hrmApi.departments.list({ page_size: '200' }),
  });

  const { data: posData, isLoading: posLoading } = useQuery({
    queryKey: queryKeys.hrm.positions.list({ page_size: '200' }),
    queryFn: () => hrmApi.positions.list({ page_size: '200' }),
  });

  const deleteDeptMut = useMutation({
    mutationFn: (id: string) => hrmApi.departments.delete(id),
    onSuccess: () => {
      toast.success('Departement supprime');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.departments.all });
    },
    onError: () => toast.error('Impossible de supprimer (employes rattaches ?)'),
  });

  const { data: polData, isLoading: polLoading } = useQuery({
    queryKey: queryKeys.hrm.attendancePolicies.list({ page_size: '200' }),
    queryFn: () => hrmApi.attendancePolicies.list({ page_size: '200' }),
  });

  const deletePosMut = useMutation({
    mutationFn: (id: string) => hrmApi.positions.delete(id),
    onSuccess: () => {
      toast.success('Poste supprime');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.positions.all });
    },
    onError: () => toast.error('Impossible de supprimer (employes rattaches ?)'),
  });

  const deletePolMut = useMutation({
    mutationFn: (id: string) => hrmApi.attendancePolicies.delete(id),
    onSuccess: () => {
      toast.success('Politique supprimee');
      qc.invalidateQueries({ queryKey: queryKeys.hrm.attendancePolicies.all });
    },
    onError: () => toast.error('Impossible de supprimer'),
  });

  const departments = deptData?.results ?? [];
  const positions = posData?.results ?? [];
  const policies = polData?.results ?? [];

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'departments', label: 'Departements', icon: <Building2 size={15} />, count: departments.length },
    { key: 'positions', label: 'Postes', icon: <Briefcase size={15} />, count: positions.length },
    { key: 'policies', label: 'Horaires', icon: <Clock size={15} />, count: policies.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Organisation</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerez les departements, postes et horaires de votre entreprise</p>
        </div>
        <button
          onClick={() => {
            if (tab === 'departments') setDeptModal({ open: true, dept: null });
            else if (tab === 'positions') setPosModal({ open: true, pos: null });
            else setPolModal({ open: true, pol: null });
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
        >
          <Plus size={16} />
          {tab === 'departments' ? 'Departement' : tab === 'positions' ? 'Poste' : 'Politique horaire'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 pb-3 pt-1 text-sm font-medium transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {t.icon} {t.label}
              <span className="ml-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {t.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Departments tab */}
      {tab === 'departments' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {deptLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : departments.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Aucun departement. Cliquez sur "+ Departement" pour en creer un.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Parent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{d.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {d.parent_name ? (
                        <span className="flex items-center gap-1">
                          <ChevronRight size={12} />
                          {d.parent_name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                        <Users size={13} />
                        {d.employee_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {d.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDeptModal({ open: true, dept: d })}
                          className="rounded p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer le departement "${d.name}" ?`))
                              deleteDeptMut.mutate(d.id);
                          }}
                          className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Positions tab */}
      {tab === 'positions' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {posLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : positions.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Aucun poste. Cliquez sur "+ Poste" pour en creer un.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Intitule</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Departement</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fourchette salariale</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Briefcase size={14} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{p.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {p.department_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {Number(p.min_salary) > 0 || Number(p.max_salary) > 0
                        ? `${Number(p.min_salary).toLocaleString('fr-FR')} - ${Number(p.max_salary).toLocaleString('fr-FR')} FCFA`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {p.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPosModal({ open: true, pos: p })}
                          className="rounded p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer le poste "${p.title}" ?`))
                              deletePosMut.mutate(p.id);
                          }}
                          className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Policies tab */}
      {tab === 'policies' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {polLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : policies.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Aucune politique horaire. Cliquez sur "+ Politique horaire" pour definir les heures de travail.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Departement</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Heure d'arrivee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Heure de depart</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Pause</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tolerance retard</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                        {p.is_default && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <Star size={10} /> Defaut
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {p.department_name || <span className="text-xs italic text-gray-400">Tous</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">
                      {p.work_start?.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">
                      {p.work_end?.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {p.break_minutes} min
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {p.late_tolerance_minutes} min
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPolModal({ open: true, pol: p })}
                          className="rounded p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer la politique "${p.name}" ?`))
                              deletePolMut.mutate(p.id);
                          }}
                          className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {deptModal.open && (
        <DepartmentModal
          department={deptModal.dept}
          departments={departments}
          onClose={() => setDeptModal({ open: false, dept: null })}
        />
      )}
      {posModal.open && (
        <PositionModal
          position={posModal.pos}
          departments={departments}
          onClose={() => setPosModal({ open: false, pos: null })}
        />
      )}
      {polModal.open && (
        <PolicyModal
          policy={polModal.pol}
          departments={departments}
          onClose={() => setPolModal({ open: false, pol: null })}
        />
      )}
    </div>
  );
}
