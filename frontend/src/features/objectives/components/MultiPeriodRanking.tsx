/** Multi-period ranking widget — day / week / month with gap message. */
import { useState } from 'react';
import type { MultiPeriodRanking, MultiPeriodRankingEntry } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { AlertCircle } from 'lucide-react';

interface Props { data: MultiPeriodRanking; period: string }

type Window = 'day' | 'week' | 'month';

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function RankTable({ entries }: { entries: MultiPeriodRankingEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Aucune donnee pour cette periode.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
          <th className="pb-2 font-medium w-12">Rang</th>
          <th className="pb-2 font-medium">Vendeur</th>
          <th className="pb-2 font-medium text-right">Encaissement</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={e.seller_id || e.seller_name}
            className={`border-b border-gray-50 dark:border-gray-700 ${e.is_me ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
          >
            <td className="py-2 font-semibold">
              <span className={e.rank <= 3 ? 'text-base' : 'text-gray-500 dark:text-gray-400 text-xs'}>{medal(e.rank)}</span>
            </td>
            <td className="py-2">
              <span className="text-gray-900 dark:text-gray-100">{e.seller_name || 'Vendeur'}</span>
              {e.is_me && (
                <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                  Moi
                </span>
              )}
            </td>
            <td className="py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(e.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MultiPeriodRankingPanel({ data, period: _period }: Props) {
  const [window, setWindow] = useState<Window>('month');
  const WINDOWS: { id: Window; label: string }[] = [
    { id: 'day', label: "Aujourd'hui" },
    { id: 'week', label: 'Cette semaine' },
    { id: 'month', label: 'Ce mois' },
  ];
  const entries = data[window];
  const gapMsg = data.gap_messages[window];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        Classement
      </h3>
      {/* Window tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            onClick={() => setWindow(w.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              window === w.id
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Gap message */}
      {gapMsg && (
        <div className="flex items-start gap-2 p-2.5 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {gapMsg}
        </div>
      )}

      <RankTable entries={entries} />
    </div>
  );
}
