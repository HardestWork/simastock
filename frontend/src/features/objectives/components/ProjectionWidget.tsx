import type { SellerDashboardProjection } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { TrendingUp, Clock } from 'lucide-react';

interface Props {
  projection: SellerDashboardProjection;
}

export default function ProjectionWidget({ projection }: Props) {
  const daily = parseFloat(projection.daily_rate);
  const projected = parseFloat(projection.projected_amount);
  const daysLeft = projection.days_to_next_tier;
  const isOnTrack = daysLeft !== null && projection.remaining_days !== null && daysLeft <= projection.remaining_days;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isOnTrack
          ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-700'
          : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp
          size={18}
          className={isOnTrack ? 'text-emerald-600' : 'text-amber-600'}
        />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Projection fin de mois
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Rythme journalier</p>
          <p className="font-bold text-gray-900 dark:text-white">
            {formatCurrency(daily)}
            <span className="text-xs font-normal text-gray-500">/j</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Projection totale</p>
          <p className="font-bold text-gray-900 dark:text-white">
            {formatCurrency(projected)}
          </p>
        </div>
      </div>

      {projection.next_tier_name && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock size={13} className={isOnTrack ? 'text-emerald-600' : 'text-amber-600'} />
            {daysLeft !== null ? (
              <span className={isOnTrack ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                {isOnTrack
                  ? `Palier ${projection.next_tier_name} atteignable en ~${daysLeft} jours`
                  : `Palier ${projection.next_tier_name} : besoin de ~${daysLeft} jours (${projection.remaining_days} restants)`}
              </span>
            ) : (
              <span className="text-gray-500">Prochain palier : {projection.next_tier_name}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
