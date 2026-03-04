import type { HallOfFameData } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  data: HallOfFameData;
  currentYear: number;
  onYearChange: (year: number) => void;
}

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

export default function HallOfFame({ data, currentYear, onYearChange }: Props) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-indexed

  // Build a map of period -> entry
  const entryMap = new Map(data.entries.map((e) => [e.period, e]));

  // Show months 01-12
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const period = `${currentYear}-${String(month).padStart(2, '0')}`;
    return { index: i, period, entry: entryMap.get(period) };
  });

  const isCurrent = (monthIndex: number) =>
    currentYear === thisYear && monthIndex === thisMonth;
  const isFuture = (monthIndex: number) =>
    currentYear > thisYear || (currentYear === thisYear && monthIndex > thisMonth);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header with year navigation */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Palmares</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onYearChange(currentYear - 1)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[50px] text-center">
            {currentYear}
          </span>
          <button
            onClick={() => onYearChange(currentYear + 1)}
            disabled={currentYear >= thisYear}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Grid of month cards */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {months.map(({ index, period, entry }) => {
          if (isFuture(index)) {
            return (
              <div
                key={period}
                className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 opacity-30"
              >
                <p className="text-xs font-medium text-gray-400">{MONTH_NAMES[index]}</p>
              </div>
            );
          }

          if (isCurrent(index)) {
            return (
              <div
                key={period}
                className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10 p-4 flex flex-col items-center justify-center"
              >
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">{MONTH_NAMES[index]}</p>
                <Trophy size={20} className="text-amber-400 mb-1 animate-pulse" />
                <p className="text-[10px] text-amber-500">En cours...</p>
              </div>
            );
          }

          if (!entry) {
            return (
              <div
                key={period}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex flex-col items-center justify-center"
              >
                <p className="text-xs font-medium text-gray-400 mb-2">{MONTH_NAMES[index]}</p>
                <p className="text-[10px] text-gray-300 dark:text-gray-600">Aucun gagnant</p>
              </div>
            );
          }

          const hasReward = parseFloat(entry.reward_amount) > 0;

          return (
            <div
              key={period}
              className="rounded-xl border border-amber-200 dark:border-amber-700 bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 p-4"
            >
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">{MONTH_NAMES[index]}</p>

              {/* Winner avatar */}
              <div className="flex flex-col items-center">
                <div className="w-11 h-11 rounded-full bg-amber-400 ring-2 ring-amber-300 flex items-center justify-center mb-1.5">
                  <span className="text-white font-bold text-sm">{entry.seller_initials}</span>
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-center truncate w-full">
                  {entry.seller_name}
                </p>
              </div>

              {/* Stats */}
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {formatCurrency(parseFloat(entry.net_amount))}
                </p>
                {entry.current_tier_name && (
                  <p className="text-[10px] text-gray-400">{entry.current_tier_name}</p>
                )}
                {hasReward && (
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                    <Trophy size={10} /> {formatCurrency(parseFloat(entry.reward_amount))}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
