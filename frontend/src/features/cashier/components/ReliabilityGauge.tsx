/** SVG circular gauge for cashier reliability score (0-100). */
import type { CashierReliabilityScore, CashierSegment } from '@/api/types';

const SEGMENT_COLORS: Record<CashierSegment, { ring: string; text: string; badge: string }> = {
  FIABLE: { ring: '#10b981', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  SOLIDE: { ring: '#3b82f6', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  FRAGILE: { ring: '#f59e0b', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  RISQUE: { ring: '#ef4444', text: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' },
};

const SEGMENT_LABELS: Record<CashierSegment, string> = {
  FIABLE: 'Fiable',
  SOLIDE: 'Solide',
  FRAGILE: 'Fragile',
  RISQUE: 'A risque',
};

const SUB_BARS: { key: keyof CashierReliabilityScore; label: string; max: number }[] = [
  { key: 'precision', label: 'Precision caisse', max: 40 },
  { key: 'speed', label: 'Vitesse traitement', max: 25 },
  { key: 'volume', label: 'Volume activite', max: 20 },
  { key: 'reliability', label: 'Fiabilite remb.', max: 15 },
];

export default function ReliabilityGauge({ score }: { score: CashierReliabilityScore }) {
  const { total, segment } = score;
  const colors = SEGMENT_COLORS[segment];
  const r = 56;
  const circumference = 2 * Math.PI * r;
  const dash = (total / 100) * circumference;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-4">Score de fiabilite caisse</p>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={70} cy={70} r={r} fill="none" stroke="currentColor" strokeWidth={10} className="text-gray-100 dark:text-gray-700" />
            <circle cx={70} cy={70} r={r} fill="none" stroke={colors.ring} strokeWidth={10} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{Math.round(total)}</span>
            <span className="text-xs text-gray-400">/100</span>
          </div>
        </div>

        <div className="flex-1 w-full space-y-2.5">
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
            {SEGMENT_LABELS[segment]}
          </span>
          {SUB_BARS.map(({ key, label, max }) => {
            const val = score[key] as number;
            const pct = (val / max) * 100;
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{label}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{val.toFixed(0)}/{max}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors.ring }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {score.actions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Recommandations</p>
          {score.actions.map((a, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
              <span className="shrink-0 text-gray-400">-&gt;</span>
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}