import type { SellerHistoryMonth } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  history: SellerHistoryMonth[];
  currentYear: number;
  onYearChange: (year: number) => void;
}

const TIER_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600',
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-gray-200 text-gray-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-purple-100 text-purple-700',
};

export default function MonthlyHistoryTable({ history, currentYear, onYearChange }: Props) {
  const now = new Date();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Year navigation */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Historique mensuel</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onYearChange(currentYear - 1)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-12 text-center">
            {currentYear}
          </span>
          <button
            onClick={() => onYearChange(currentYear + 1)}
            disabled={currentYear >= now.getFullYear()}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
          Aucune donnée pour {currentYear}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Période', 'Objectif', 'Réalisé', 'Bonus', 'Palier', 'Rang'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {history.map((row) => (
                <tr
                  key={row.period}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                    {row.period}
                    {row.is_final && (
                      <span className="ml-1.5 text-[10px] bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        Clôturé
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">—</td>
                  <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">
                    {formatCurrency(parseFloat(row.net_amount))}
                  </td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                    {parseFloat(row.bonus_earned) > 0 ? formatCurrency(parseFloat(row.bonus_earned)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.current_tier_name ? (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          TIER_COLORS[row.current_tier_rank] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.current_tier_name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {row.rank ? `#${row.rank}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
