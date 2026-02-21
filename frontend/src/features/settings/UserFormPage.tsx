/** Unified user create / edit page (ADMIN only). */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, roleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { AxiosError } from 'axios';

const SYSTEM_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'SALES', label: 'Vendeur' },
  { value: 'CASHIER', label: 'Caissier' },
  { value: 'STOCKER', label: 'Magasinier' },
] as const;

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // ---- Form state ----
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('SALES');
  const [customRoleId, setCustomRoleId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- Fetch custom roles ----
  const { data: rolesData } = useQuery({
    queryKey: queryKeys.roles.list({ is_active: 'true' }),
    queryFn: () => roleApi.list({ is_active: 'true', page_size: '100' }),
  });
  const customRoles = rolesData?.results ?? [];

  // ---- Fetch existing user for edit mode ----
  const {
    data: user,
    isLoading: isLoadingUser,
  } = useQuery({
    queryKey: queryKeys.users.detail(id!),
    queryFn: () => userApi.get(id!),
    enabled: isEdit,
  });

  // ---- Populate form when user loads (edit mode) ----
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone || '');
      setRole(user.role || 'SALES');
      setCustomRoleId(user.custom_role ?? '');
      setIsActive(user.is_active ?? true);
    }
  }, [user]);

  // ---- Helpers to extract API error message ----
  const extractErrorMessage = (err: unknown): string => {
    const axiosErr = err as AxiosError<Record<string, unknown> | string>;
    const status = axiosErr?.response?.status;
    const data = axiosErr?.response?.data;
    if (data) {
      if (typeof data === 'string') {
        return status
          ? `Erreur serveur (${status}). Veuillez reessayer.`
          : 'Erreur serveur. Veuillez reessayer.';
      }
      if (typeof data.detail === 'string') return data.detail;
      // Collect field-level errors
      const messages: string[] = [];
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          messages.push(`${key}: ${val.join(', ')}`);
        } else if (typeof val === 'string') {
          messages.push(`${key}: ${val}`);
        }
      }
      if (messages.length > 0) return messages.join(' | ');
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  };

  // ---- Create mutation ----
  const createMut = useMutation({
    mutationFn: (data: {
      email: string;
      first_name: string;
      last_name: string;
      phone?: string;
      role: string;
      password: string;
      password_confirm: string;
    }) => userApi.create(data),
    onSuccess: () => {
      toast.success(`Utilisateur cree: ${firstName.trim()} ${lastName.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      navigate('/settings/users');
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setSubmitError(extractErrorMessage(err));
    },
  });

  // ---- Update mutation ----
  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      userApi.update(id!, data as Parameters<typeof userApi.update>[1]),
    onSuccess: () => {
      toast.info(`Utilisateur mis a jour: ${firstName.trim()} ${lastName.trim()}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id!) });
      navigate('/settings/users');
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setSubmitError(extractErrorMessage(err));
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const canSubmit = isEdit
    ? firstName.trim() !== '' && lastName.trim() !== '' && !isPending
    : email.trim() !== '' &&
      firstName.trim() !== '' &&
      lastName.trim() !== '' &&
      password.trim() !== '' &&
      passwordConfirm.trim() !== '' &&
      !isPending;

  // ---- Submit handler ----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);

    if (isEdit) {
      const updateData: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || '',
        role,
        custom_role: customRoleId || null,
        is_active: isActive,
      };
      updateMut.mutate(updateData);
    } else {
      if (password !== passwordConfirm) {
        setSubmitError('Les mots de passe ne correspondent pas.');
        return;
      }
      createMut.mutate({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || undefined,
        role,
        custom_role: customRoleId || undefined,
        password,
        password_confirm: passwordConfirm,
      } as Parameters<typeof userApi.create>[0]);
    }
  };

  // ---- Loading spinner for edit mode ----
  if (isEdit && isLoadingUser) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <Link
        to="/settings/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
      >
        <ArrowLeft size={16} />
        Retour aux utilisateurs
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {isEdit ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Email */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-100"
                placeholder="exemple@email.com"
                required
              />
            </div>

            {/* Prenom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Prenom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Prenom"
                required
              />
            </div>

            {/* Nom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Nom"
                required
              />
            </div>

            {/* Telephone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telephone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Telephone (optionnel)"
              />
            </div>

            {/* Custom role */}
            {customRoles.length > 0 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={customRoleId}
                  onChange={(e) => {
                    const crId = e.target.value;
                    setCustomRoleId(crId);
                    // Sync system role from custom role's base_role
                    const cr = customRoles.find((r) => r.id === crId);
                    if (cr) setRole(cr.base_role);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">-- Selectionner un role --</option>
                  {customRoles.map((cr) => (
                    <option key={cr.id} value={cr.id}>{cr.name}</option>
                  ))}
                </select>
                {!customRoleId && (
                  <p className="text-xs text-amber-600 mt-1">
                    Veuillez selectionner un role.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                >
                  {SYSTEM_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Actif toggle â€” edit mode only */}
            {isEdit && (
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Utilisateur actif
                  </span>
                </label>
              </div>
            )}

            {/* Password fields â€” create mode only */}
            {!isEdit && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mot de passe <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Mot de passe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirmer le mot de passe <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Confirmer le mot de passe"
                    required
                  />
                </div>
              </>
            )}
          </div>

          {/* Error alert */}
          {submitError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <Link
              to="/settings/users"
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEdit ? 'Mettre a jour' : "Creer l'utilisateur"}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

