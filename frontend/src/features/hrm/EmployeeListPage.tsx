/** HRM — Employee list page with search, filter, pagination. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Users,
  Building2,
  Briefcase,
} from 'lucide-react';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import SortableHeader from '@/components/shared/SortableHeader';
import Pagination from '@/components/shared/Pagination';
import type { HrmEmployeeStatus } from '@/api/types';

const PAGE_SIZE = 25;

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

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, toggleSort, ordering } = useSort('last_name', 'asc');

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter && { status: statusFilter }),
    ...(ordering && { ordering }),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hrm.employees.list(params),
    queryFn: () => hrmApi.employees.list(params),
  });

  const employees = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={24} /> Employes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data ? `${data.count} employe(s)` : ''}
          </p>
        </div>
        <Link
          to="/hrm/employees/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition"
        >
          <Plus size={16} /> Nouvel employe
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, matricule, telephone..."
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
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Matricule</th>
              <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1"><Building2 size={13} /> Departement</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1"><Briefcase size={13} /> Poste</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Telephone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    Chargement...
                  </div>
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Aucun employe trouve.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => navigate(`/hrm/employees/${emp.id}`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                >
                  <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">
                    {emp.employee_number}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {emp.photo ? (
                        <img
                          src={emp.photo}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {emp.full_name}
                        </p>
                        {emp.email && (
                          <p className="text-xs text-gray-400">{emp.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {emp.department_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {emp.position_title ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {emp.phone || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[emp.status]}`}>
                      {STATUS_LABELS[emp.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
