/** One-step enterprise + store + admin user creation page (ADMIN only). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { enterpriseApi } from '@/api/endpoints';
import type { EnterpriseSetupPayload } from '@/api/types';
import { ArrowLeft, Save, Loader2, AlertCircle, CheckCircle2, Building2, Store, UserCog } from 'lucide-react';
import type { AxiosError } from 'axios';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

function extractError(err: unknown): string {
  const ax = err as AxiosError<Record<string, unknown> | string>;
  const data = ax?.response?.data;
  if (data) {
    if (typeof data === 'string') return 'Erreur serveur. Veuillez reessayer.';
    if (typeof data.detail === 'string') return data.detail;
    const msgs: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val)) msgs.push(`${key}: ${val.join(', ')}`);
      else if (typeof val === 'string') msgs.push(`${key}: ${val}`);
    }
    if (msgs.length) return msgs.join(' | ');
  }
  return 'Une erreur est survenue. Veuillez reessayer.';
}

export default function EnterpriseSetupPage() {
  // Enterprise fields
  const [entName, setEntName] = useState('');
  const [entCode, setEntCode] = useState('');
  const [entCurrency, setEntCurrency] = useState('FCFA');
  const [entEmail, setEntEmail] = useState('');
  const [entPhone, setEntPhone] = useState('');
  const [canCreateStores, setCanCreateStores] = useState(true);
  const [subscriptionStart, setSubscriptionStart] = useState('');
  const [subscriptionEnd, setSubscriptionEnd] = useState('');

  // Store fields
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeEmail, setStoreEmail] = useState('');

  // User fields
  const [userEmail, setUserEmail] = useState('');
  const [userFirstName, setUserFirstName] = useState('');
  const [userLastName, setUserLastName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userRole, setUserRole] = useState<'ADMIN' | 'MANAGER'>('ADMIN');
  const [userPassword, setUserPassword] = useState('');
  const [userPasswordConfirm, setUserPasswordConfirm] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: EnterpriseSetupPayload) => enterpriseApi.setup(data),
    onSuccess: () => setSuccess(true),
    onError: (err: unknown) => setError(extractError(err)),
  });

  const canSubmit =
    entName.trim() !== '' &&
    entCode.trim() !== '' &&
    storeName.trim() !== '' &&
    storeCode.trim() !== '' &&
    userEmail.trim() !== '' &&
    userFirstName.trim() !== '' &&
    userLastName.trim() !== '' &&
    userPassword.trim() !== '' &&
    userPasswordConfirm.trim() !== '' &&
    !mutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    if (userPassword !== userPasswordConfirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    mutation.mutate({
      enterprise_name: entName.trim(),
      enterprise_code: entCode.trim(),
      enterprise_currency: entCurrency.trim() || 'FCFA',
      enterprise_email: entEmail.trim(),
      enterprise_phone: entPhone.trim(),
      can_create_stores: canCreateStores,
      subscription_start: subscriptionStart || null,
      subscription_end: subscriptionEnd || null,
      store_name: storeName.trim(),
      store_code: storeCode.trim(),
      store_address: storeAddress.trim(),
      store_phone: storePhone.trim(),
      store_email: storeEmail.trim(),
      user_email: userEmail.trim(),
      user_first_name: userFirstName.trim(),
      user_last_name: userLastName.trim(),
      user_phone: userPhone.trim(),
      user_role: userRole,
      user_password: userPassword,
      user_password_confirm: userPasswordConfirm,
    });
  };

  const resetForm = () => {
    setEntName(''); setEntCode(''); setEntCurrency('FCFA'); setEntEmail(''); setEntPhone(''); setCanCreateStores(true);
    setSubscriptionStart(''); setSubscriptionEnd('');
    setStoreName(''); setStoreCode(''); setStoreAddress(''); setStorePhone(''); setStoreEmail('');
    setUserEmail(''); setUserFirstName(''); setUserLastName(''); setUserPhone('');
    setUserRole('MANAGER'); setUserPassword(''); setUserPasswordConfirm('');
    setError(null); setSuccess(false);
    mutation.reset();
  };

  if (success) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Entreprise creee avec succes</h2>
          <p className="text-sm text-gray-500 mb-6">
            L'entreprise, la boutique et l'utilisateur administrateur ont ete crees.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={resetForm}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Creer une autre entreprise
            </button>
            <Link
              to="/settings/stores"
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Retour aux parametres
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        to="/settings/stores"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
      >
        <ArrowLeft size={16} />
        Retour aux parametres
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Creer une entreprise</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1 — Enterprise */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Entreprise</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input type="text" value={entName} onChange={(e) => setEntName(e.target.value)} className={inputClass} placeholder="Ex: Ma Societe" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input type="text" value={entCode} onChange={(e) => setEntCode(e.target.value)} className={inputClass} placeholder="Ex: MASOC" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
              <input type="text" value={entCurrency} onChange={(e) => setEntCurrency(e.target.value)} className={inputClass} placeholder="FCFA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
              <input type="text" value={entPhone} onChange={(e) => setEntPhone(e.target.value)} className={inputClass} placeholder="Telephone (optionnel)" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={entEmail} onChange={(e) => setEntEmail(e.target.value)} className={inputClass} placeholder="contact@entreprise.com (optionnel)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Debut d'abonnement</label>
              <input type="date" value={subscriptionStart} onChange={(e) => setSubscriptionStart(e.target.value)} className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Vide = actif immediatement</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin d'abonnement</label>
              <input type="date" value={subscriptionEnd} onChange={(e) => setSubscriptionEnd(e.target.value)} className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Vide = pas d'expiration</p>
            </div>
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={canCreateStores}
                    onChange={(e) => setCanCreateStores(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-primary transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </div>
                <span className="text-sm font-medium text-gray-700">Autoriser la creation de boutiques</span>
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-[52px]">
                L'administrateur de cette entreprise pourra creer de nouvelles boutiques.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2 — Store */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Store size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Premiere boutique</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputClass} placeholder="Ex: Boutique Centre" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input type="text" value={storeCode} onChange={(e) => setStoreCode(e.target.value)} className={inputClass} placeholder="Ex: CENTRE01" required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className={inputClass} placeholder="Adresse (optionnel)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
              <input type="text" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} className={inputClass} placeholder="Telephone (optionnel)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={storeEmail} onChange={(e) => setStoreEmail(e.target.value)} className={inputClass} placeholder="boutique@email.com (optionnel)" />
            </div>
          </div>
        </div>

        {/* Section 3 — Admin User */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserCog size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Administrateur</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className={inputClass} placeholder="admin@entreprise.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prenom <span className="text-red-500">*</span>
              </label>
              <input type="text" value={userFirstName} onChange={(e) => setUserFirstName(e.target.value)} className={inputClass} placeholder="Prenom" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input type="text" value={userLastName} onChange={(e) => setUserLastName(e.target.value)} className={inputClass} placeholder="Nom" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
              <input type="text" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} className={inputClass} placeholder="Telephone (optionnel)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as 'ADMIN' | 'MANAGER')}
                className={inputClass}
              >
                <option value="ADMIN">Administrateur</option>
                <option value="MANAGER">Gestionnaire</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} className={inputClass} placeholder="Min. 8 caracteres" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer <span className="text-red-500">*</span>
              </label>
              <input type="password" value={userPasswordConfirm} onChange={(e) => setUserPasswordConfirm(e.target.value)} className={inputClass} placeholder="Confirmer le mot de passe" required />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            to="/settings/stores"
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creation en cours...
              </>
            ) : (
              <>
                <Save size={16} />
                Creer l'entreprise
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
