import type { SellerDashboard } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface Props {
  penalties: SellerDashboard['penalties'];
}

export default function DisciplineBlock({ penalties }: Props) {
  if (penalties.items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 flex flex-col items-center gap-3 text-center">
        <ShieldCheck size={40} className="text-emerald-500" />
        <p className="font-semibold text-gray-700 dark:text-gray-200">
          Aucune pénalité ce mois !
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Continuez comme ça pour maximiser votre bonus.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Pénalités</h3>
        </div>
        <span className="text-sm font-bold text-red-600 dark:text-red-400">
          -{formatCurrency(parseFloat(penalties.total_deduction))}
        </span>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-gray-700">
        {penalties.items.map((p) => (
          <div key={p.id} className="flex items-start gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.type}</p>
              {p.reason && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.reason}</p>
              )}
            </div>
            {p.mode === 'DEDUCTION' && (
              <span className="text-sm font-semibold text-red-600 dark:text-red-400 shrink-0">
                -{formatCurrency(parseFloat(p.amount))}
              </span>
            )}
            {p.mode === 'HARD_CAP' && (
              <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-0.5 rounded-full shrink-0">
                Plafonnement
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
