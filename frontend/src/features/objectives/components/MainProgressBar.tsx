import { useEffect, useRef } from 'react';
import type { SellerDashboard } from '@/api/types';
import { formatCurrency } from '@/lib/currency';

interface Props {
  data: SellerDashboard;
}

export default function MainProgressBar({ data }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const sortedTiers = [...data.tiers].sort((a, b) => a.rank - b.rank);
  const net = parseFloat(data.progress.net_amount);
  const currentRank = data.progress.current_tier_rank;
  const currentTier = sortedTiers.find((t) => t.rank === currentRank) ?? null;
  const nextTier = sortedTiers.find((t) => t.rank > currentRank) ?? null;

  const currentThreshold = currentTier ? parseFloat(currentTier.threshold) : 0;
  const nextThreshold = nextTier ? parseFloat(nextTier.threshold) : null;
  const remaining = nextThreshold !== null ? Math.max(0, nextThreshold - net) : 0;
  const isNextTierBlocked = Boolean(nextTier && net >= parseFloat(nextTier.threshold));

  const pct = nextThreshold !== null
    ? Math.min(
      100,
      Math.max(
        0,
        ((net - currentThreshold) / Math.max(nextThreshold - currentThreshold, 1)) * 100,
      ),
    )
    : currentRank > 0
      ? 100
      : Math.min(100, Math.max(0, data.progress.progress_pct));
  const tierName = data.progress.current_tier_name;

  // Find tier color
  const tier = data.tiers.find((t) => t.rank === data.progress.current_tier_rank);
  const color = tier?.color ?? '#3B82F6';

  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = '0%';
      requestAnimationFrame(() => {
        if (barRef.current) {
          barRef.current.style.transition = 'width 1s ease-out';
          barRef.current.style.width = `${pct}%`;
        }
      });
    }
  }, [pct]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Progression du mois
          </span>
          {tierName && (
            <span
              className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              {tierName}
            </span>
          )}
        </div>
        <span className="text-sm font-bold text-gray-900 dark:text-white">
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Track */}
      <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          ref={barRef}
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: '0%' }}
        />
      </div>

      {isNextTierBlocked ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
          Palier suivant bloque (penalite active).
        </p>
      ) : remaining > 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Encore{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {formatCurrency(remaining)}
          </span>{' '}
          pour atteindre le prochain palier
        </p>
      ) : (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Palier maximum atteint !
        </p>
      )}
    </div>
  );
}
