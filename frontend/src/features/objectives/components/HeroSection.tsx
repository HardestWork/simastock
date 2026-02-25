import type { SellerDashboard } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { Target, TrendingUp, Award, Zap } from 'lucide-react';

interface Props {
  data: SellerDashboard;
}

export default function HeroSection({ data }: Props) {
  const net = parseFloat(data.progress.net_amount);
  const earned = parseFloat(data.bonus.earned);
  const tierName = data.progress.current_tier_name || 'Aucun palier';
  const currentRank = data.progress.current_tier_rank;

  const sortedTiers = [...data.tiers].sort((a, b) => a.rank - b.rank);
  const nextTier = sortedTiers.find((t) => t.rank > currentRank) ?? null;
  const isNextTierBlocked = Boolean(
    nextTier && net >= parseFloat(nextTier.threshold),
  );

  let nextBonus: number | null = null;
  if (nextTier && !isNextTierBlocked) {
    const bonusAmount = parseFloat(nextTier.bonus_amount);
    if (bonusAmount > 0) {
      nextBonus = bonusAmount;
    } else {
      const bonusRate = parseFloat(nextTier.bonus_rate);
      if (bonusRate > 0) {
        nextBonus = (parseFloat(nextTier.threshold) * bonusRate) / 100;
      }
    }
  }

  const cards = [
    {
      label: 'Encaissement valide',
      value: formatCurrency(net),
      icon: <TrendingUp size={22} className="text-blue-500" />,
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      valueClass: 'text-blue-700 dark:text-blue-300',
    },
    {
      label: 'Objectif du mois',
      value: sortedTiers.length > 0 ? formatCurrency(parseFloat(sortedTiers[0].threshold)) : '-',
      icon: <Target size={22} className="text-purple-500" />,
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      valueClass: 'text-purple-700 dark:text-purple-300',
    },
    {
      label: 'Bonus actuel',
      value: earned > 0 ? formatCurrency(earned) : '-',
      sub: tierName,
      icon: <Award size={22} className="text-emerald-500" />,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      valueClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Prochain bonus',
      value: isNextTierBlocked
        ? 'Palier bloque'
        : nextBonus !== null
          ? formatCurrency(nextBonus)
          : earned > 0
            ? 'Max atteint !'
            : '-',
      sub: nextTier
        ? isNextTierBlocked
          ? `Palier ${nextTier.name} non accessible`
          : `Palier ${nextTier.name}`
        : undefined,
      icon: <Zap size={22} className="text-amber-500" />,
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      valueClass: 'text-amber-700 dark:text-amber-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} rounded-xl p-4 flex flex-col gap-2`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {card.label}
            </span>
            {card.icon}
          </div>
          <span className={`text-xl font-bold ${card.valueClass}`}>{card.value}</span>
          {card.sub && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{card.sub}</span>
          )}
        </div>
      ))}
    </div>
  );
}
