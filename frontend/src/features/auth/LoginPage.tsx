/** Login page style: balanced split layout with branded left panel. */
import axios from 'axios';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/auth/auth-store';

function extractLoginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 429) {
      if (typeof data?.detail === 'string' && data.detail.trim()) {
        return `Trop de tentatives. ${data.detail}`;
      }
      return 'Trop de tentatives de connexion. Reessaie dans 1 minute.';
    }

    if (typeof data?.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }
  }
  return 'Email ou mot de passe incorrect.';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = extractLoginErrorMessage(err);
      toast.error(message);
      setError(message);
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
            <div className="flex flex-col items-center gap-3">
              <img
                src="/logo-icon.png"
                alt="Logo SimaStock"
                className="h-24 w-auto object-contain drop-shadow-[0_10px_24px_rgba(2,6,23,0.35)]"
              />
              <div className="inline-flex items-center rounded-full border border-white/30 bg-white/12 px-5 py-1.5 backdrop-blur-sm">
                <span className="text-2xl font-extrabold tracking-[0.08em] text-white">Simastock</span>
              </div>
            </div>
          </div>

          <div className="max-w-xl">
            <h1 className="text-4xl font-semibold leading-tight text-slate-50">
              Pilotez votre boutique sans zones mortes.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-blue-100/90">
              Centralisez les ventes, le stock et vos equipes dans une interface plus lisible et plus rapide.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-blue-50/90 sm:grid-cols-2">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Suivi des ventes en temps reel</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Alertes stock immediates</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Tableaux de bord clairs</div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">Gestion multi-utilisateurs</div>
            </div>
          </div>

          <p className="text-sm text-blue-100/80">Systeme de gestion commercial</p>
        </div>
      </section>

      <section className="relative z-10 w-full lg:w-[45%]">
        <div className="flex min-h-screen items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white px-6 py-7 shadow-xl shadow-slate-900/15 sm:px-8 sm:py-9">
            <div className="mb-6 flex flex-col items-center justify-center gap-1.5 lg:hidden">
              <img src="/logo-icon.png" alt="Logo SimaStock" className="h-16 w-auto object-contain" />
              <p className="text-lg font-bold tracking-wide text-slate-800">Simastock</p>
            </div>

            <div className="mb-6">
              <h3
                className="mb-2.5 font-bold"
                style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}
              >
                Connexion
              </h3>
              <p
                style={{ fontSize: '15px', fontWeight: 400, color: '#334155', lineHeight: 1.4 }}
              >
                Accedez a votre espace de gestion avec votre email et mot de passe.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mb-3">
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

              <div className="mb-3">
                <label
                  htmlFor="password"
                  style={{ display: 'block', width: '100%', color: '#0F172A', marginBottom: '10px', fontSize: '15px', fontWeight: 400 }}
                >
                  Mot de passe <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-[8px] border border-slate-300/80 bg-white px-4 pr-11 text-[14px] text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Votre mot de passe"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-[14px] text-slate-500">
                    <input type="checkbox" className="h-4 w-4 rounded accent-primary" />
                    <span>Se souvenir de moi</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[14px] font-medium transition-colors hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Mot de passe oublie ?
                  </Link>
                </div>
              </div>

              <div className="mb-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 w-full rounded-[8px] text-[14px] font-bold text-white transition-colors disabled:opacity-60"
                  style={{
                    background: isLoading ? '#123B68' : 'var(--color-primary)',
                  }}
                >
                  {isLoading ? 'Connexion en cours...' : 'Se connecter'}
                </button>
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
