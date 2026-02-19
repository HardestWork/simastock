/** User management page (ADMIN only) with search, role filter, and table. */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useDebounce } from '@/hooks/use-debounce';
import { useSort } from '@/hooks/use-sort';
import Pagination from '@/components/shared/Pagination';
import SortableHeader from '@/components/shared/SortableHeader';
import { Search, UserPlus, Pencil, UserCheck, UserX, AlertCircle } from 'lucide-react';
import type { User, UserRole } from '@/api/types';
import type { AxiosError } from 'axios';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  SALES: 'bg-emerald-100 text-emerald-700',
  CASHIER: 'bg-amber-100 text-amber-700',
  STOCKER: 'bg-gray-100 text-gray-700',
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'SALES', label: 'Vendeur' },
  { value: 'CASHIER', label: 'Caissier' },
  { value: 'STOCKER', label: 'Magasinier' },
];

export default function UserListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { sortField, sortDirection, ordering, toggleSort } = useSort('last_name', 'asc');

  useEffect(() => { setPage(1); }, [ordering]);

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  if (ordering) params.ordering = ordering;
  if (debouncedSearch) params.search = debouncedSearch;
  if (roleFilter) params.role = roleFilter;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => userApi.list(params),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (user: User) =>
      userApi.update(user.id, { is_active: !user.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });

  const handleToggleActive = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    toggleActiveMutation.mutate(user);
  };

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Gestion des utilisateurs
        </h1>
        <Link
          to="/settings/users/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <UserPlus size={18} />
          Nouvel utilisateur
        </Link>
      </div>

      {/* Search + Role filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher par nom ou email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {data && (
            <div className="ml-auto text-sm text-gray-500">
              {data.count} utilisateur{data.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Toggle-active error */}
      {toggleActiveMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          Erreur lors de la mise a jour :{' '}
          {((toggleActiveMutation.error as AxiosError)?.response?.data as any)
            ?.detail ?? 'Erreur inconnue'}
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Erreur chargement utilisateurs :{' '}
          {((error as AxiosError)?.response?.data as any)?.detail ??
            (error as Error).message}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-600">
                <SortableHeader field="last_name" label="Utilisateur" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="px-4 py-3 font-medium">Telephone</th>
                <SortableHeader field="role" label="Role" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <SortableHeader field="is_active" label="Statut" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/settings/users/${user.id}/edit`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="text-xs text-gray-400">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.phone || '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      />
                      {user.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/settings/users/${user.id}/edit`);
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                        title="Modifier"
                      >
                        <Pencil size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={(e) => handleToggleActive(e, user)}
                        className={`p-1.5 rounded-lg ${user.is_active ? 'hover:bg-red-50' : 'hover:bg-emerald-50'}`}
                        title={
                          user.is_active
                            ? 'Desactiver le compte'
                            : 'Activer le compte'
                        }
                        disabled={toggleActiveMutation.isPending}
                      >
                        {user.is_active ? (
                          <UserX size={15} className="text-red-500" />
                        ) : (
                          <UserCheck size={15} className="text-emerald-500" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Aucun utilisateur trouve.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
