/** Password reset request page (forgot password). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

import { authApi } from '@/api/endpoints';

function errDetail(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string } | string>;
  const data = ax?.response?.data;
  if (typeof data === 'string') {
    const status = ax?.response?.status;
    return status ? `Erreur serveur (${status}).` : 'Erreur serveur.';
  }
  return (data as { detail?: string } | undefined)?.detail ?? (err as Error)?.message ?? 'Erreur.';
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [debugLink, setDebugLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDebugLink(null);
    setIsPending(true);
    try {
      const res = await authApi.requestPasswordReset(email.trim());
      toast.success('Lien de reinitialisation envoye');
      setSuccess(res.detail);
      if (res.debug_reset_url) setDebugLink(res.debug_reset_url);
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
            <Mail size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mot de passe oublie</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Entrez votre email pour recevoir un lien de reinitialisation.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
              {success}
              {debugLink && (
                <div className="mt-2">
                  <a className="text-emerald-800 underline break-all" href={debugLink}>
                    Ouvrir le lien (dev)
                  </a>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              placeholder="email@exemple.com"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !email.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            <Send size={16} />
            {isPending ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>
      </div>
    </div>
  );
}

