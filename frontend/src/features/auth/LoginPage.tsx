/** Login page style: balanced split layout with branded left panel. */
import axios from 'axios';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail, Eye, EyeOff, BarChart3, Bell, Users, ShoppingBag } from 'lucide-react';
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

const FEATURES = [
  { icon: BarChart3, label: 'Ventes en temps réel' },
  { icon: Bell, label: 'Alertes stock instantanées' },
  { icon: ShoppingBag, label: 'Gestion multi-boutiques' },
  { icon: Users, label: 'Équipes & permissions' },
];

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
    <div className="relative flex min-h-screen overflow-hidden bg-[#0d1f38]">
      {/* ── Ambient glows ── */}
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-blue-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-[80px]" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-sky-400/15 blur-[90px]" />

      {/* ════════════════════════════════════════
          LEFT PANEL  (visible lg+)
      ════════════════════════════════════════ */}
      <section className="relative z-10 hidden lg:flex lg:w-[52%] flex-col px-12 py-10">
        {/* ── Logo row (top-left) ── */}
        <div className="flex items-center gap-3 mb-12">
          <img
            src="/logo-icon.png"
            alt="Logo SimaStock"
            className="h-11 w-auto object-contain drop-shadow-[0_4px_16px_rgba(56,189,248,0.4)]"
          />
          <span className="text-[22px] font-extrabold tracking-[0.06em] text-white">
            Simastock
          </span>
        </div>

        {/* ── Main headline ── */}
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-400 mb-3">
            Système de gestion commerciale
          </p>
          <h1 className="text-[2.9rem] font-bold leading-[1.15] text-white mb-5">
            Pilotez votre&nbsp;boutique<br />
            <span className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">
              sans zones&nbsp;mortes.
            </span>
          </h1>
          <p className="text-base text-blue-100/70 mb-10 max-w-sm leading-relaxed">
            Centralisez les ventes, le stock et vos équipes dans une interface lisible et rapide.
          </p>

          {/* ── Feature chips ── */}
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm"
              >
                <Icon size={16} className="text-sky-300 shrink-0" />
                <span className="text-[13px] text-blue-50/85 leading-tight">{label}</span>
              </div>
            ))}
          </div>

          {/* ── Decorative dashboard mockup ── */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm max-w-sm">
            {/* mini bar chart mockup */}
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-blue-100/60">Chiffre d'affaires — Aujourd'hui</span>
            </div>
            <div className="flex items-end gap-1.5 h-12">
              {[35, 55, 40, 70, 50, 80, 65, 90, 72, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: i === 9
                      ? 'linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)'
                      : 'rgba(148,196,248,0.25)',
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-blue-100/40">
              <span>8h</span><span>12h</span><span>17h</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-blue-100/40 mt-8">
          &copy; {new Date().getFullYear()} SimaStock — Tous droits réservés
        </p>
      </section>

      {/* ════════════════════════════════════════
          RIGHT PANEL — Login form
      ════════════════════════════════════════ */}
      <section className="relative z-10 flex w-full lg:w-[48%] items-center justify-center p-6 lg:p-10">
        {/* Glass backdrop */}
        <div className="absolute inset-0 hidden lg:block bg-white/[0.03] border-l border-white/[0.07]" />

        <div className="relative w-full max-w-[420px] rounded-2xl border border-slate-200/80 bg-white px-7 py-8 shadow-2xl shadow-slate-900/30">
          {/* Logo shown on mobile only */}
          <div className="mb-6 flex flex-col items-center gap-1.5 lg:hidden">
            <img src="/logo-icon.png" alt="Logo SimaStock" className="h-14 w-auto object-contain" />
            <p className="text-lg font-bold tracking-wide text-slate-800">Simastock</p>
          </div>

          <div className="mb-6">
            <h3 className="text-2xl font-bold text-slate-900 mb-1.5">Connexion</h3>
            <p className="text-[14px] text-slate-500 leading-relaxed">
              Accédez à votre espace de gestion.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Adresse e-mail <span className="text-red-500">*</span>
              </label>
              <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 flex-1 bg-transparent px-4 text-[14px] text-slate-800 outline-none"
                  placeholder="email@exemple.com"
                />
                <span className="flex items-center border-l border-slate-200 px-3 text-slate-400">
                  <Mail size={16} />
                </span>
              </div>
            </div>

            {/* Password */}
            <div className="mb-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
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
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 pr-11 text-[14px] text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember + forgot */}
            <div className="mb-6 flex items-center justify-between">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-slate-500">
                <input type="checkbox" className="h-4 w-4 rounded accent-primary" />
                <span>Se souvenir de moi</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-primary hover:underline transition-colors"
              >
                Mot de passe oublié ?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full rounded-lg text-[14px] font-bold text-white transition-colors disabled:opacity-60"
              style={{ background: isLoading ? '#123B68' : 'var(--color-primary)' }}
            >
              {isLoading ? 'Connexion en cours...' : 'Se connecter'}
            </button>

            <div className="mt-8 text-center text-[12px] text-slate-400">
              Copyright &copy; {new Date().getFullYear()} SimaStock
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
