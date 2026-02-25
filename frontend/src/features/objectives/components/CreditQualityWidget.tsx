/** Credit quality widget — recovery rate, overdue analysis, top debtors. */
import type { CreditQuality } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { CreditCard, AlertCircle, CheckCircle2, TrendingUp, Wallet } from 'lucide-react';

interface Props { data: CreditQuality }

export default function CreditQualityWidget({ data }: Props) {
  const { credit_issued, credit_recovered, recovery_rate, overdue_count, overdue_amount, avg_days_overdue, top_debtors } = data;
  const issued = Number.parseFloat(String(credit_issued ?? 0)) || 0;
  const recovered = Number.parseFloat(String(credit_recovered ?? 0)) || 0;
  const outstanding = Math.max(issued - recovered, 0);
  const rateColor = recovery_rate >= 70 ? 'text-emerald-600' : recovery_rate >= 40 ? 'text-amber-600' : 'text-red-600';
  const barColor = recovery_rate >= 70 ? 'bg-emerald-500' : recovery_rate >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { label: 'Credit accorde', value: formatCurrency(issued), icon: CreditCard, color: 'text-blue-600' },
          { label: 'Credit recouvre', value: formatCurrency(recovered), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Encours credit', value: formatCurrency(outstanding), icon: Wallet, color: 'text-amber-600' },
          { label: 'Taux recouvrement', value: `${recovery_rate.toFixed(1)}%`, icon: CheckCircle2, color: rateColor },
          { label: 'Echeances en retard', value: overdue_count > 0 ? `${overdue_count} (${formatCurrency(overdue_amount)})` : 'Aucun', icon: AlertCircle, color: overdue_count > 0 ? 'text-red-600' : 'text-emerald-600' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <Icon size={18} className={`${kpi.color} mb-2`} />
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recovery bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex justify-between items-center mb-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Progression recouvrement</span>
          <span className={`font-bold ${rateColor}`}>{recovery_rate.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${Math.min(recovery_rate, 100)}%` }} />
        </div>
        {avg_days_overdue > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Delai moyen de retard: {avg_days_overdue.toFixed(0)} jours
          </p>
        )}
      </div>

      {/* Top debtors */}
      {top_debtors.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Clients en retard
          </h3>
          <div className="space-y-2">
            {top_debtors.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">{d.customer_name}</span>
                <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(d.overdue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
