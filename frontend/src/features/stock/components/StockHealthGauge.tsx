import type { StockHealthScore } from '@/api/types';

interface Props {
  score: StockHealthScore;
}

const SEGMENT_CONFIG = {
  SANTE: { color: '#10b981', label: 'Sain', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
  CORRECT: { color: '#3b82f6', label: 'Correct', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
  FRAGILE: { color: '#f59e0b', label: 'Fragile', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
  CRITIQUE: { color: '#ef4444', label: 'Critique', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300' },
};

const COMPONENTS = [
  { key: 'coverage' as const, label: 'Couverture', max: 30 },
  { key: 'freshness' as const, label: 'Fraicheur', max: 30 },
  { key: 'availability' as const, label: 'Disponibilite', max: 25 },
  { key: 'reliability' as const, label: 'Fiabilite', max: 15 },
];

export default function StockHealthGauge({ score }: Props) {
  const cfg = SEGMENT_CONFIG[score.segment];
  const radius = 52;
  const stroke = 10;
  const normalizedR = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedR;
  const dashOffset = circumference * (1 - score.total / 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Score de sante du stock</h3>
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="relative flex-shrink-0">
          <svg width={radius * 2 + 20} height={radius * 2 + 20} className="rotate-[-90deg]">
            <circle cx={radius + 10} cy={radius + 10} r={normalizedR} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
            <circle
              cx={radius + 10}
              cy={radius + 10}
              r={normalizedR}
              fill="none"
              stroke={cfg.color}
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
            <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{score.total}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
          </div>
        </div>

        <div className="flex-1 space-y-3 w-full">
          {COMPONENTS.map((c) => {
            const val = score[c.key];
            const pct = Math.round((val / c.max) * 100);
            return (
              <div key={c.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{val.toFixed(1)} / {c.max}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {score.actions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions recommandees</p>
          {score.actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-amber-500 mt-0.5">-&gt;</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
