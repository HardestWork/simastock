import type { LeaderboardEntry } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  entries: LeaderboardEntry[];
  period: string;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function RankChange({ change }: { change: number }) {
  if (change > 0)
    return (
      <span className="flex items-center gap-0.5 text-emerald-600 text-xs">
        <TrendingUp size={12} />+{change}
      </span>
    );
  if (change < 0)
    return (
      <span className="flex items-center gap-0.5 text-red-500 text-xs">
        <TrendingDown size={12} />{change}
      </span>
    );
  return <Minus size={12} className="text-gray-400" />;
}

export default function LeaderboardPanel({ entries, period }: Props) {
  if (entries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400">
        Pas encore de classement pour {period}.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">
          Classement — {period}
        </h3>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-gray-700">
        {entries.map((entry) => (
          <div
            key={`${entry.rank}-${entry.seller_id || entry.seller_name}`}
            className={`flex items-center gap-3 px-4 py-3 ${
              entry.is_me ? 'bg-blue-50 dark:bg-blue-950/30' : ''
            }`}
          >
            {/* Rank */}
            <span className="w-8 text-center text-sm font-bold text-gray-700 dark:text-gray-300">
              {MEDAL[entry.rank] ?? `#${entry.rank}`}
            </span>

            {/* Name + tier */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium truncate ${
                  entry.is_me
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-gray-800 dark:text-gray-100'
                }`}
              >
                {entry.seller_name}
                {entry.is_me && (
                  <span className="ml-1.5 text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 px-1.5 py-0.5 rounded">
                    Moi
                  </span>
                )}
              </p>
              {entry.current_tier_name && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {entry.current_tier_name}
                </p>
              )}
            </div>

            {/* Amount */}
            {entry.net_amount !== undefined && (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                {formatCurrency(parseFloat(entry.net_amount))}
              </span>
            )}

            {/* Rank change */}
            <div className="w-10 flex justify-end">
              <RankChange change={entry.rank_change} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
