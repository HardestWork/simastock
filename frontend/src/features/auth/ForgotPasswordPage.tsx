/** Password reset request page with split branded layout. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { authApi } from '@/api/endpoints';

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
      toast.success(`Lien de reinitialisation envoye: ${email.trim()}`);
      setSuccess(res.detail);
      if (res.debug_reset_url) setDebugLink(res.debug_reset_url);
    } catch (err) {
      const message = extractApiError(err);
      toast.error(message);
      setError(message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(120deg, #0B1F36 0%, #154A80 52%, #2B7FC8 100%)',
      }}
    >
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-blue-100/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-16 h-80 w-80 rounded-full bg-sky-200/20 blur-3xl" />

      <section className="relative z-10 hidden lg:flex lg:w-[55%]">
        <div className="flex h-full w-full flex-col justify-between px-14 py-12 text-white">
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center rounded-xl bg-white/95 px-4 py-3 shadow-lg shadow-slate-900/30 ring-1 ring-white/70">
              <img src="/logo-full.png" alt="SimaStock" className="h-16 w-auto object-contain" />
            </div>
          </div>

          <div className="max-w-xl">
            <h1 className="text-4xl font-semibold leading-tight text-slate-50">
              Recuperation de mot de passe rapide et claire.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-blue-100/90">
              Saisissez votre email pour recevoir un lien securise de reinitialisation et reprendre l'acces a votre espace.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-blue-50/90 sm:grid-cols-2">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Lien de reset unique</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Envoi immediat</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Flux securise</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Retour au login en 1 clic</div>
            </div>
          </div>

          <p className="text-sm text-blue-100/80">systeme de gestion comercial</p>
        </div>
      </section>

      <section className="relative z-10 w-full lg:w-[45%]">
        <div className="flex min-h-screen items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white px-6 py-7 shadow-xl shadow-slate-900/15 sm:px-8 sm:py-9">
            <div className="mb-6 flex items-center justify-center lg:hidden">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <img src="/logo-full.png" alt="SimaStock" className="h-14 w-auto object-contain" />
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2.5 font-bold" style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>
                Mot de passe oublie
              </h3>
              <p style={{ fontSize: '15px', fontWeight: 400, color: '#334155', lineHeight: 1.4 }}>
                Entrez votre adresse e-mail pour recevoir un lien de reinitialisation.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                  {debugLink && (
                    <div className="mt-2">
                      <a className="break-all text-emerald-800 underline" href={debugLink}>
                        Ouvrir le lien (dev)
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label
                  htmlFor="email"
                  style={{ display: 'block', width: '100%', color: '#0F172A', marginBottom: '10px', fontSize: '15px', fontWeight: 400 }}
                >
                  Adresse e-mail <span className="text-red-500">*</span>
                </label>
                <div className="flex overflow-hidden rounded-[8px] border border-slate-300/80 bg-white transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 flex-1 bg-white px-4 text-[14px] text-slate-800 outline-none"
                    placeholder="email@exemple.com"
                  />
                  <span className="flex items-center border-l border-slate-200 px-3 text-slate-400">
                    <Mail size={16} />
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <button
                  type="submit"
                  disabled={isPending || !email.trim()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] text-[14px] font-bold text-white transition-colors disabled:opacity-60"
                  style={{
                    background: isPending ? '#123B68' : 'var(--color-primary)',
                  }}
                >
                  <Send size={16} />
                  {isPending ? 'Envoi en cours...' : 'Envoyer le lien'}
                </button>
              </div>

              <div className="flex justify-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-[14px] font-medium transition-colors hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <ArrowLeft size={14} />
                  Retour a la connexion
                </Link>
              </div>

              <div className="mt-10 flex items-center justify-center">
                <p style={{ fontSize: '13px', color: '#475569', fontWeight: 400 }}>
                  Copyright &copy; {new Date().getFullYear()} SimaStock
                </p>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
