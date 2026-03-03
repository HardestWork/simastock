/** Unified user create / edit page (ADMIN only). */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, roleApi, storeApi, storeUserApi } from '@/api/endpoints';
import type { Store, StoreUserRecord } from '@/api/types';
import { queryKeys } from '@/lib/query-keys';
import { ArrowLeft, Save, Loader2, AlertCircle, Copy, Check, X, Mail, KeyRound, ChevronDown, ChevronUp, Building2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

interface CreatedCredentials {
  name: string;
  email: string;
  password: string;
  role: string;
}

const SYSTEM_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'HR', label: 'Ressources Humaines' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'SALES', label: 'Vendeur' },
  { value: 'CASHIER', label: 'Caissier' },
  { value: 'SALES_CASHIER', label: 'Vendeur-Caissier' },
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
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      const roleName = customRoles.find((r) => r.id === customRoleId)?.name
        ?? SYSTEM_ROLE_OPTIONS.find((r) => r.value === role)?.label
        ?? role;
      setCreatedCredentials({
        name: `${variables.first_name} ${variables.last_name}`,
        email: variables.email,
        password: variables.password,
        role: roleName,
      });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setSubmitError(extractApiError(err));
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
      toast.error(extractApiError(err));
      setSubmitError(extractApiError(err));
    },
  });

  // ---- Reset password mutation (edit mode only) ----
  const resetPasswordMut = useMutation({
    mutationFn: (newPwd: string) => userApi.setPassword(id!, newPwd),
    onSuccess: () => {
      toast.success('Mot de passe reinitialise avec succes.');
      setShowPasswordReset(false);
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordResetError(null);
    },
    onError: (err: unknown) => {
      setPasswordResetError(extractApiError(err));
    },
  });

  const handleResetPassword = () => {
    setPasswordResetError(null);
    if (newPassword.length < 8) {
      setPasswordResetError('Le mot de passe doit contenir au moins 8 caracteres.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordResetError('Les mots de passe ne correspondent pas.');
      return;
    }
    resetPasswordMut.mutate(newPassword);
  };

  // ---- Stores list (edit mode) ----
  const { data: storesData } = useQuery({
    queryKey: ['stores', 'list-all'],
    queryFn: () => storeApi.list({ page_size: '200' }),
    enabled: isEdit,
  });
  const allStores: Store[] = storesData?.results ?? [];

  // ---- User's store-user records (edit mode) ----
  const { data: storeUsersData, refetch: refetchStoreUsers } = useQuery({
    queryKey: ['store-users', 'by-user', id],
    queryFn: () => storeUserApi.list({ user: id! }),
    enabled: isEdit,
  });
  const userStoreLinks: StoreUserRecord[] = storeUsersData?.results ?? [];

  // ---- Assign store mutation ----
  const assignStoreMut = useMutation({
    mutationFn: (storeId: string) => storeApi.assignUsers(storeId, [id!]),
    onSuccess: () => {
      refetchStoreUsers();
      toast.success('Magasin assigne avec succes.');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  // ---- Remove store assignment mutation ----
  const removeStoreMut = useMutation({
    mutationFn: (storeUserId: string) => storeUserApi.remove(storeUserId),
    onSuccess: () => {
      refetchStoreUsers();
      toast.info('Acces au magasin retire.');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
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

  // ---- Copy credentials to clipboard ----
  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = [
      `Informations de connexion`,
      `---`,
      `Nom: ${createdCredentials.name}`,
      `Role: ${createdCredentials.role}`,
      `Email: ${createdCredentials.email}`,
      `Mot de passe: ${createdCredentials.password}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Informations copiees dans le presse-papier');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCloseCredentials = () => {
    setCreatedCredentials(null);
    navigate('/settings/users');
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

          {/* Reset password section — edit mode only */}
          {isEdit && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordReset((v) => !v);
                  setPasswordResetError(null);
                  setNewPassword('');
                  setNewPasswordConfirm('');
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                <KeyRound size={15} />
                Modifier le mot de passe
                {showPasswordReset ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showPasswordReset && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nouveau mot de passe <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Nouveau mot de passe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirmer <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Confirmer le mot de passe"
                    />
                  </div>
                  {passwordResetError && (
                    <div className="sm:col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{passwordResetError}</span>
                    </div>
                  )}
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetPasswordMut.isPending || !newPassword || !newPasswordConfirm}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors"
                    >
                      {resetPasswordMut.isPending ? (
                        <><Loader2 size={14} className="animate-spin" />Reinitialisation...</>
                      ) : (
                        <><KeyRound size={14} />Reinitialiser le mot de passe</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Magasins assignes — edit mode only */}
          {isEdit && allStores.length > 0 && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} className="text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Magasins assignes
                </span>
              </div>
              <div className="space-y-2">
                {allStores.map((store) => {
                  const link = userStoreLinks.find((su) => su.store === store.id);
                  const isAssigned = !!link;
                  const isDefault = link?.is_default ?? false;
                  const isOnlyStore = userStoreLinks.length === 1 && isAssigned;
                  return (
                    <div
                      key={store.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${
                        isAssigned
                          ? 'border-green-200 bg-green-50 dark:border-green-700/50 dark:bg-green-900/10'
                          : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {store.name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                          {store.code}
                        </span>
                        {isDefault && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            Par defaut
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 ml-3">
                        {isAssigned ? (
                          <button
                            type="button"
                            onClick={() => link && removeStoreMut.mutate(link.id)}
                            disabled={removeStoreMut.isPending || isOnlyStore}
                            title={isOnlyStore ? 'Impossible de retirer le seul magasin assigne' : 'Retirer'}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 size={12} />
                            Retirer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => assignStoreMut.mutate(store.id)}
                            disabled={assignStoreMut.isPending}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded disabled:opacity-40 transition-colors"
                          >
                            <Plus size={12} />
                            Ajouter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

      {/* Credentials modal after successful creation */}
      {createdCredentials && (() => {
        const mailSubject = encodeURIComponent('Vos identifiants de connexion');
        const mailBody = encodeURIComponent(
          [
            `Bonjour ${createdCredentials.name},`,
            '',
            'Votre compte a ete cree. Voici vos identifiants de connexion :',
            '',
            `Email: ${createdCredentials.email}`,
            `Mot de passe: ${createdCredentials.password}`,
            `Role: ${createdCredentials.role}`,
            '',
            `Connexion: ${window.location.origin}/login`,
            '',
            'Veuillez changer votre mot de passe apres votre premiere connexion.',
          ].join('\n'),
        );
        const mailto = `mailto:${encodeURIComponent(createdCredentials.email)}?subject=${mailSubject}&body=${mailBody}`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Utilisateur cree avec succes
                </h2>
                <button
                  onClick={handleCloseCredentials}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="px-6 pb-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Voici les informations de connexion. Copiez-les ou envoyez-les par email.
                </p>
              </div>

              {/* Credentials card */}
              <div className="mx-6 my-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Nom</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {createdCredentials.name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Role</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {createdCredentials.role}
                  </span>
                </div>
                <hr className="border-gray-200 dark:border-gray-700" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Email</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {createdCredentials.email}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Mot de passe</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {createdCredentials.password}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-5 pt-2 flex items-center gap-3">
                <button
                  onClick={handleCopyCredentials}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copie' : 'Copier'}
                </button>
                <a
                  href={mailto}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Mail size={14} />
                  Envoyer
                </a>
                <div className="flex-1" />
                <button
                  onClick={handleCloseCredentials}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

