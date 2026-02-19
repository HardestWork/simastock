/** Reusable KPI card with icon, value, label, and optional trend indicator. */
import type { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: string;
  trend?: number | null;
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <ArrowUpRight size={14} />
        +{trend}%
      </span>
    );
  }

  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <ArrowDownRight size={14} />
        {trend}%
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-gray-400">0%</span>
  );
}

export default function KpiCard({ label, value, icon, color, trend }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`${color} text-white p-3 rounded-lg`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {trend != null && <TrendIndicator trend={trend} />}
      </div>
    </div>
  );
}
