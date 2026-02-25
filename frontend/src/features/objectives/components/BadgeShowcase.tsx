import type { SellerBadge } from '@/api/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Trophy, Zap, TrendingUp, Star, CheckCircle, Award, CreditCard } from 'lucide-react';

const BADGE_ICONS: Record<string, React.ReactNode> = {
  BEST_MONTH: <Trophy size={24} className="text-amber-500" />,
  SPRINT_WINNER: <Zap size={24} className="text-yellow-500" />,
  MOST_IMPROVED: <TrendingUp size={24} className="text-emerald-500" />,
  TIER_ELITE: <Star size={24} className="text-purple-500" />,
  CONSISTENCY: <CheckCircle size={24} className="text-blue-500" />,
  PERFECT_MONTH: <Award size={24} className="text-rose-500" />,
  CREDIT_CHAMPION: <CreditCard size={24} className="text-teal-500" />,
};

interface Props {
  badges: SellerBadge[];
}

export default function BadgeShowcase({ badges }: Props) {
  if (badges.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <Trophy size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Pas encore de badges. Continuez vos efforts !</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {badges.map((badge) => (
        <div
          key={badge.id}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center text-center gap-2"
        >
          <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
            {BADGE_ICONS[badge.badge_type] ?? <Award size={24} className="text-gray-400" />}
          </div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">
            {badge.label || badge.badge_type}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{badge.period}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {format(new Date(badge.created_at), 'd MMM yyyy', { locale: fr })}
          </p>
        </div>
      ))}
    </div>
  );
}
