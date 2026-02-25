/** Recent shifts list with variance indicators. */
import { formatCurrency } from '@/lib/currency';
import type { CashierShiftSummary } from '@/api/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ShiftHistoryList({ shifts }: { shifts: CashierShiftSummary[] }) {
  if (shifts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">
        Aucun shift enregistre cette periode.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Historique des shifts</p>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-gray-700">
        {shifts.map((s) => {
          const variance = s.variance !== null ? parseFloat(s.variance) : null;
          const varColor =
            variance === null
              ? 'text-gray-400'
              : Math.abs(variance) < 500
                ? 'text-emerald-600 dark:text-emerald-400'
                : Math.abs(variance) < 2000
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400';
          const isOpen = s.status === 'OPEN';

          return (
            <div key={s.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      isOpen
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {isOpen ? 'En cours' : 'Cloture'}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(s.opened_at)}</p>
                </div>
                {s.duration_h !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.duration_h.toFixed(1)} h - {s.transaction_count} transaction(s)
                  </p>
                )}
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatCurrency(parseFloat(s.total_collected))}
                </p>
                {variance !== null && (
                  <p className={`text-xs tabular-nums ${varColor}`}>
                    Ecart: {variance >= 0 ? '+' : ''}
                    {formatCurrency(Math.abs(variance))}
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