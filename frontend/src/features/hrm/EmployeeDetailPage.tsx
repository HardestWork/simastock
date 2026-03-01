/** HRM — Employee detail page with tabs for contracts, attendance, leaves, documents. */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  FileText,
  Clock,
  Calendar,
  Edit,
  Phone,
  Mail,
  Building2,
  Briefcase,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import type { HrmEmployeeStatus } from '@/api/types';

const STATUS_LABELS: Record<HrmEmployeeStatus, string> = {
  ACTIVE: 'Actif',
  ON_LEAVE: 'En conge',
  SUSPENDED: 'Suspendu',
  TERMINATED: 'Licencie',
  RESIGNED: 'Demissionnaire',
};

const STATUS_COLORS: Record<HrmEmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  ON_LEAVE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  SUSPENDED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  TERMINATED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  RESIGNED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

type Tab = 'info' | 'contracts' | 'leaves' | 'documents';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');
  const queryClient = useQueryClient();

  const { data: employee, isLoading } = useQuery({
    queryKey: queryKeys.hrm.employees.detail(id!),
    queryFn: () => hrmApi.employees.get(id!),
    enabled: !!id,
  });

  const { data: contracts } = useQuery({
    queryKey: queryKeys.hrm.contracts.list({ employee: id! }),
    queryFn: () => hrmApi.contracts.list({ employee: id! }),
    enabled: !!id && tab === 'contracts',
  });

  const { data: leaveRequests } = useQuery({
    queryKey: queryKeys.hrm.leaveRequests.list({ employee: id! }),
    queryFn: () => hrmApi.leaveRequests.list({ employee: id! }),
    enabled: !!id && tab === 'leaves',
  });

  const { data: documents } = useQuery({
    queryKey: queryKeys.hrm.documents.list({ employee: id! }),
    queryFn: () => hrmApi.documents.list({ employee: id! }),
    enabled: !!id && tab === 'documents',
  });

  const approveMut = useMutation({
    mutationFn: (leaveId: string) => hrmApi.leaveRequests.approve(leaveId),
    onSuccess: () => {
      toast.success('Demande approuvee');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.leaveRequests.all });
    },
  });

  const rejectMut = useMutation({
    mutationFn: (leaveId: string) => hrmApi.leaveRequests.reject(leaveId),
    onSuccess: () => {
      toast.success('Demande rejetee');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.leaveRequests.all });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="py-12 text-center text-gray-500">Employe introuvable.</div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: 'Informations', icon: <User size={15} /> },
    { key: 'contracts', label: 'Contrats', icon: <FileText size={15} /> },
    { key: 'leaves', label: 'Conges', icon: <Calendar size={15} /> },
    { key: 'documents', label: 'Documents', icon: <Clock size={15} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/hrm/employees"
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {employee.photo ? (
              <img src={employee.photo} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold">
                {employee.first_name[0]}{employee.last_name[0]}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {employee.full_name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {employee.employee_number}
                {employee.position_title && ` · ${employee.position_title}`}
              </p>
            </div>
            <span className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[employee.status]}`}>
              {STATUS_LABELS[employee.status]}
            </span>
          </div>
        </div>
        <Link
          to={`/hrm/employees/${id}/edit`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 transition"
        >
          <Edit size={14} /> Modifier
        </Link>
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
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal info */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Informations personnelles</h3>
            <dl className="space-y-3">
              <InfoRow icon={<Mail size={14} />} label="Email" value={employee.email || '—'} />
              <InfoRow icon={<Phone size={14} />} label="Telephone" value={employee.phone || '—'} />
              <InfoRow label="Genre" value={employee.gender === 'M' ? 'Masculin' : employee.gender === 'F' ? 'Feminin' : '—'} />
              <InfoRow label="Date de naissance" value={employee.date_of_birth || '—'} />
              <InfoRow label="N° CNI/Passeport" value={employee.national_id || '—'} />
              <InfoRow icon={<MapPin size={14} />} label="Adresse" value={employee.address || '—'} />
            </dl>
          </div>

          {/* Work info */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Informations professionnelles</h3>
            <dl className="space-y-3">
              <InfoRow icon={<Building2 size={14} />} label="Departement" value={employee.department_name || '—'} />
              <InfoRow icon={<Briefcase size={14} />} label="Poste" value={employee.position_title || '—'} />
              <InfoRow label="Boutique" value={employee.store_name || '—'} />
              <InfoRow label="Superieur" value={employee.manager_name || '—'} />
              <InfoRow label="Date d'embauche" value={employee.hire_date || '—'} />
              <InfoRow label="Salaire de base" value={formatCurrency(Number(employee.base_salary))} />
              <InfoRow label="Banque" value={employee.bank_name || '—'} />
              <InfoRow label="Compte bancaire" value={employee.bank_account || '—'} />
            </dl>
          </div>

          {/* Emergency contact */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Contact d'urgence</h3>
            <dl className="space-y-3">
              <InfoRow label="Nom" value={employee.emergency_contact_name || '—'} />
              <InfoRow icon={<Phone size={14} />} label="Telephone" value={employee.emergency_contact_phone || '—'} />
            </dl>
          </div>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Debut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fin</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Salaire</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {(contracts?.results ?? []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Aucun contrat.</td></tr>
              ) : (
                (contracts?.results ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium">{c.contract_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.reference || '—'}</td>
                    <td className="px-4 py-3 text-sm">{c.start_date}</td>
                    <td className="px-4 py-3 text-sm">{c.end_date || '—'}</td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(Number(c.salary))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Du</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Au</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Jours</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {(leaveRequests?.results ?? []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Aucune demande de conge.</td></tr>
              ) : (
                (leaveRequests?.results ?? []).map((lr) => (
                  <tr key={lr.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm">{lr.leave_type_name}</td>
                    <td className="px-4 py-3 text-sm">{lr.start_date}</td>
                    <td className="px-4 py-3 text-sm">{lr.end_date}</td>
                    <td className="px-4 py-3 text-sm">{lr.days_requested}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        lr.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        lr.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        lr.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {lr.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lr.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMut.mutate(lr.id)}
                            disabled={approveMut.isPending}
                            className="rounded bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 transition"
                          >
                            Approuver
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(lr.id)}
                            disabled={rejectMut.isPending}
                            className="rounded bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 transition"
                          >
                            Rejeter
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
      )}

      {tab === 'documents' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Titre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Expiration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fichier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {(documents?.results ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Aucun document.</td></tr>
              ) : (
                (documents?.results ?? []).map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm">{d.doc_type}</td>
                    <td className="px-4 py-3 text-sm font-medium">{d.title}</td>
                    <td className="px-4 py-3 text-sm">{d.expiry_date || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <a
                        href={d.file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Telecharger
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-gray-400">{icon}</span>}
      <dt className="w-36 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
