/** Profile page â€” view/edit user info and change password. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/auth/auth-store';
import { User as UserIcon, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  // Profile form state
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Update profile mutation
  const updateProfileMut = useMutation({
    mutationFn: (data: { first_name: string; last_name: string; phone: string }) =>
      authApi.updateMe(data),
    onSuccess: (updatedUser) => {
      toast.success(`Profil mis a jour: ${updatedUser.first_name} ${updatedUser.last_name}`);
      useAuthStore.setState({ user: updatedUser });
      setProfileMsg({ type: 'success', text: 'Profil utilisateur mis a jour.' });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setProfileMsg({ type: 'error', text: 'Erreur lors de la mise a jour du profil.' });
    },
  });

  // Change password mutation
  const changePasswordMut = useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      authApi.changePassword(data),
    onSuccess: () => {
      toast.info('Mot de passe modifie avec succes.');
      setPasswordMsg({ type: 'success', text: 'Mot de passe modifie.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setPasswordMsg({ type: 'error', text: 'Erreur lors du changement de mot de passe. Verifiez l\'ancien mot de passe.' });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    updateProfileMut.mutate({ first_name: firstName, last_name: lastName, phone });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 8 caracteres.' });
      return;
    }
    changePasswordMut.mutate({ old_password: oldPassword, new_password: newPassword });
  };

  if (!user) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Chargement...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Mon profil</h1>

      {/* User info card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <UserIcon size={28} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {user.first_name} {user.last_name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prenom</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telephone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 text-sm ${profileMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
              {profileMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {profileMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={updateProfileMut.isPending}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-60 transition-colors"
          >
            {updateProfileMut.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>
      </div>

      {/* Change password card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock size={20} className="text-gray-400 dark:text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Changer le mot de passe</h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ancien mot de passe</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {passwordMsg && (
            <div className={`flex items-center gap-2 text-sm ${passwordMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
              {passwordMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {passwordMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={changePasswordMut.isPending}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-60 transition-colors"
          >
            {changePasswordMut.isPending ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}

