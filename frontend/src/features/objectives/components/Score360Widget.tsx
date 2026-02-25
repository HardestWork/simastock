/** Score 360° widget — circular gauge + 4 sub-scores + 3 recommended actions. */
import type { Score360 } from '@/api/types';
import { Zap, TrendingUp, CreditCard, Shield, ChevronRight } from 'lucide-react';

interface Props { score: Score360 }

function GaugeSVG({ value }: { value: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="70" y="65" textAnchor="middle" fontSize="28" fontWeight="bold" fill={color}>{value}</text>
      <text x="70" y="85" textAnchor="middle" fontSize="11" fill="#6b7280">/100</text>
    </svg>
  );
}

const SUB_SCORES = [
  { key: 'encaissement', label: 'Encaissement', max: 40, icon: TrendingUp, color: 'bg-blue-500' },
  { key: 'credit', label: 'Credit', max: 20, icon: CreditCard, color: 'bg-emerald-500' },
  { key: 'discipline', label: 'Discipline', max: 25, icon: Shield, color: 'bg-amber-500' },
  { key: 'vitesse', label: 'Vitesse', max: 15, icon: Zap, color: 'bg-purple-500' },
] as const;

export default function Score360Widget({ score }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        Score Performance 360°
      </h3>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="shrink-0">
          <GaugeSVG value={score.total} />
        </div>
        {/* Sub-scores */}
        <div className="flex-1 w-full space-y-3">
          {SUB_SCORES.map((s) => {
            const val = score[s.key as keyof Score360] as number;
            const pct = (val / s.max) * 100;
            const Icon = s.icon;
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Icon size={12} />
                    {s.label}
                  </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{val}/{s.max}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${s.color} rounded-full transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {score.actions.length > 0 && (
        <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Actions recommandees
          </p>
          <ul className="space-y-2">
            {score.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <ChevronRight size={14} className="text-primary shrink-0 mt-0.5" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
