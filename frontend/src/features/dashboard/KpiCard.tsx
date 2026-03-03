/**
 * KPI card — PreAdmin "dash-widget" style.
 * White background, colored circle icon on the left, value + label on the right.
 */
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  /** Tailwind bg class for the icon circle, e.g. "bg-red-100 dark:bg-red-900/30" */
  iconBg: string;
  /** Tailwind text class for the icon color, e.g. "text-red-500" */
  iconColor: string;
  trend?: number | null;
}

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-md mt-1">
        <TrendingUp size={11} />
        +{trend}%
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-md mt-1">
        <TrendingDown size={11} />
        {trend}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 px-2 py-0.5 rounded-md mt-1">
      <Minus size={11} />
      Stable
    </span>
  );
}

export default function KpiCard({ label, value, icon, iconBg, iconColor, trend }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 transition-shadow duration-200 hover:shadow-md">
      {/* Colored icon circle */}
      <div
        className={`w-12 h-12 rounded-full ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        {trend != null && <TrendBadge trend={trend} />}
      </div>
    </div>
  );
}
