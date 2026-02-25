import type { ObjectiveTier } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { Check, Lock } from 'lucide-react';

interface Props {
  tiers: ObjectiveTier[];
  currentRank: number;
  netAmount: number;
}

export default function TierTimeline({ tiers, currentRank, netAmount }: Props) {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);
  const isBlockedTier = (tier: ObjectiveTier) =>
    tier.rank > currentRank && netAmount >= parseFloat(tier.threshold);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
        Paliers
      </h3>
      <div className="flex items-start gap-0">
        {sorted.map((tier, idx) => {
          const reached = tier.rank <= currentRank;
          const blocked = isBlockedTier(tier);
          const isActive = tier.rank === currentRank;
          const leftReached = idx > 0 ? sorted[idx - 1].rank <= currentRank : false;
          const rightReached = tier.rank <= currentRank;
          return (
            <div key={tier.id} className="flex-1 flex flex-col items-center">
              {/* Connector line (before dot, except first) */}
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className="h-1 flex-1"
                    style={{ backgroundColor: leftReached ? sorted[idx - 1].color : '#E5E7EB' }}
                  />
                )}
                {/* Dot */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2"
                  style={{
                    backgroundColor: reached ? tier.color : 'transparent',
                    borderColor: reached ? tier.color : blocked ? '#F59E0B' : '#D1D5DB',
                  }}
                >
                  {reached ? (
                    <Check size={14} className="text-white" />
                  ) : blocked ? (
                    <Lock size={12} className="text-amber-500" />
                  ) : (
                    <span className="text-xs text-gray-400">{tier.rank}</span>
                  )}
                </div>
                {idx < sorted.length - 1 && (
                  <div
                    className="h-1 flex-1"
                    style={{ backgroundColor: rightReached ? tier.color : '#E5E7EB' }}
                  />
                )}
              </div>

              {/* Label */}
              <div className="mt-2 text-center">
                <p
                  className="text-xs font-semibold"
                  style={{ color: isActive ? tier.color : undefined }}
                >
                  {tier.name}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatCurrency(parseFloat(tier.threshold))}
                </p>
                {parseFloat(tier.bonus_amount) > 0 && (
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(parseFloat(tier.bonus_amount))}
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
