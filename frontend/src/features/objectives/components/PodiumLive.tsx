import type { PodiumData } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  data: PodiumData;
}

const MEDAL_COLORS = [
  { bg: 'bg-amber-400', ring: 'ring-amber-300', text: 'text-amber-700', label: '1er' },
  { bg: 'bg-gray-300', ring: 'ring-gray-200', text: 'text-gray-600', label: '2e' },
  { bg: 'bg-amber-600', ring: 'ring-amber-500', text: 'text-amber-800', label: '3e' },
];
const MEDAL_EMOJI: Record<number, string> = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };
const PILLAR_H = ['h-28', 'h-20', 'h-16'];

function RankChangeIcon({ change }: { change: number }) {
  if (change > 0)
    return <span className="flex items-center gap-0.5 text-emerald-600 text-xs"><TrendingUp size={10} />+{change}</span>;
  if (change < 0)
    return <span className="flex items-center gap-0.5 text-red-500 text-xs"><TrendingDown size={10} />{change}</span>;
  return <Minus size={10} className="text-gray-400" />;
}

export default function PodiumLive({ data }: Props) {
  const { podium, my_position, reward_amount, total_sellers } = data;
  const hasReward = parseFloat(reward_amount) > 0;

  if (podium.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-400">
        Pas encore de donnees pour le podium.
      </div>
    );
  }

  // Order for display: 2nd | 1st | 3rd
  const displayOrder = podium.length >= 3
    ? [podium[1], podium[0], podium[2]]
    : podium.length === 2
      ? [podium[1], podium[0]]
      : [podium[0]];
  const colorOrder = podium.length >= 3 ? [1, 0, 2] : podium.length === 2 ? [1, 0] : [0];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Podium Live</h3>
        </div>
        {hasReward && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold">
            <Trophy size={12} /> Prix : {formatCurrency(parseFloat(reward_amount))}
          </span>
        )}
      </div>

      {/* Podium */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-end justify-center gap-3">
          {displayOrder.map((entry, i) => {
            const ci = colorOrder[i];
            const mc = MEDAL_COLORS[ci];
            return (
              <div key={entry.seller_id || i} className="flex flex-col items-center flex-1 max-w-[140px]">
                {/* Medal */}
                <span className="text-2xl mb-1">{MEDAL_EMOJI[entry.position]}</span>
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full ${mc.bg} ring-2 ${mc.ring} flex items-center justify-center mb-1.5`}>
                  <span className="text-white font-bold text-sm">{entry.seller_initials}</span>
                </div>
                {/* Name */}
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 text-center truncate w-full">
                  {entry.seller_name}
                </p>
                {/* Amount */}
                {entry.net_amount && (
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-0.5">
                    {formatCurrency(parseFloat(entry.net_amount))}
                  </p>
                )}
                {/* Tier */}
                {entry.current_tier_name && (
                  <span className="text-[10px] text-gray-400 mt-0.5">{entry.current_tier_name}</span>
                )}
                {/* Rank change */}
                <div className="mt-0.5">
                  <RankChangeIcon change={entry.rank_change} />
                </div>
                {/* Pillar */}
                <div className={`${PILLAR_H[ci]} w-full mt-2 rounded-t-lg ${mc.bg} opacity-20`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* My position (if not on podium) */}
      {!my_position.is_on_podium && my_position.rank > 0 && (
        <div className="mx-4 mb-4 mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Votre position : #{my_position.rank} / {total_sellers}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                {formatCurrency(parseFloat(my_position.net_amount))}
              </p>
            </div>
            {parseFloat(my_position.gap_to_podium) > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Il manque <span className="font-semibold">{formatCurrency(parseFloat(my_position.gap_to_podium))}</span> pour le podium
              </p>
            )}
          </div>
        </div>
      )}

      {/* On podium */}
      {my_position.is_on_podium && my_position.rank > 0 && (
        <div className="mx-4 mb-4 mt-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Vous etes #{my_position.rank} sur le podium !
          </p>
        </div>
      )}
    </div>
  );
}
