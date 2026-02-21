/** Password reset confirmation page. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { KeyRound, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

import { authApi } from '@/api/endpoints';

function errDetail(err: unknown): string {
  const ax = err as AxiosError<Record<string, unknown> | string>;
  const data = ax?.response?.data;
  if (typeof data === 'string') {
    const status = ax?.response?.status;
    return status ? `Erreur serveur (${status}).` : 'Erreur serveur.';
  }
  if (data && typeof data === 'object') {
    if (typeof (data as { detail?: string }).detail === 'string') return (data as { detail?: string }).detail as string;
    const messages: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) messages.push(`${k}: ${v.join(', ')}`);
      else if (typeof v === 'string') messages.push(`${k}: ${v}`);
    }
    if (messages.length) return messages.join(' | ');
  }
  return (err as Error)?.message ?? 'Erreur.';
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const uid = search.get('uid') ?? '';
  const token = search.get('token') ?? '';
  const hasParams = useMemo(() => Boolean(uid && token), [uid, token]);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasParams) return;
    setError(null);
    setSuccess(null);
    setIsPending(true);
    try {
      const res = await authApi.confirmPasswordReset({
        uid,
        token,
        new_password1: pw1,
        new_password2: pw2,
      });
      toast.success('Mot de passe reinitialise avec succes');
      setSuccess(res.detail);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      toast.error('Une erreur est survenue');
      setError(errDetail(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={16} /> Retour a la connexion
          </Link>
        </div>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nouveau mot de passe</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choisissez un nouveau mot de passe.</p>
        </div>

        {!hasParams ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
            Lien invalide. Retournez sur la page <Link className="text-primary hover:underline" to="/forgot-password">Mot de passe oublie</Link>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="pw1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nouveau mot de passe
              </label>
              <input
                id="pw1"
                type="password"
                required
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="pw2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirmer
              </label>
              <input
                id="pw2"
                type="password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || !pw1 || !pw2}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              <Save size={16} />
              {isPending ? 'Enregistrement...' : 'Mettre a jour'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

