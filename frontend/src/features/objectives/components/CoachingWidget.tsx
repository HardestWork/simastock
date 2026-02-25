/** Daily coaching widget — 3 personalized missions + evening summary. */
import type { CoachingData, CoachingCategory } from '@/api/types';
import { TrendingUp, CreditCard, Shield, Zap, Sun, Moon } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

interface Props { data: CoachingData }

const CATEGORY_META: Record<CoachingCategory, { icon: typeof TrendingUp; color: string; label: string }> = {
  performance: { icon: TrendingUp, color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400', label: 'Performance' },
  credit: { icon: CreditCard, color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400', label: 'Credit' },
  discipline: { icon: Shield, color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400', label: 'Discipline' },
  speed: { icon: Zap, color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400', label: 'Rapidite' },
};

export default function CoachingWidget({ data }: Props) {
  const { morning_missions, evening_summary } = data;

  return (
    <div className="space-y-4">
      {/* Morning missions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sun size={18} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Missions du jour</h3>
        </div>

        {morning_missions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Aucune mission pour l'instant. Continuez vos efforts !
          </p>
        ) : (
          <div className="space-y-3">
            {morning_missions.map((m) => {
              const meta = CATEGORY_META[m.category] ?? CATEGORY_META.performance;
              const Icon = meta.icon;
              return (
                <div key={m.id} className={`flex items-start gap-3 p-3.5 rounded-lg border ${meta.color}`}>
                  <Icon size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{m.title}</p>
                    <p className="text-xs mt-0.5 opacity-80">{m.detail}</p>
                  </div>
                  <span className="ml-auto text-xs font-bold opacity-60">#{m.priority}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Evening summary */}
      {evening_summary && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Moon size={18} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bilan du jour</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(evening_summary.net_today)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Encaisse aujourd'hui</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {evening_summary.missions_done}/{evening_summary.missions_total}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Missions completees</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
