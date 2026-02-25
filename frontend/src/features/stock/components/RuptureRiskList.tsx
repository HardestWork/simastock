import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { RuptureRiskItem } from '@/api/types';

interface Props {
  items: RuptureRiskItem[];
}

const URGENCY_CONFIG = {
  CRITICAL: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', label: 'Critique' },
  WARNING: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', label: 'Alerte' },
  LOW: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', label: 'A surveiller' },
};

export default function RuptureRiskList({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Risque de rupture</h3>
        <div className="text-center py-10">
          <AlertTriangle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aucun risque de rupture detecte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Risque de rupture
        <span className="ml-2 text-sm font-normal text-gray-400">({items.length} produit{items.length > 1 ? 's' : ''})</span>
      </h3>
      <div className="space-y-3">
        {items.map((item) => {
          const cfg = URGENCY_CONFIG[item.urgency];
          const Icon = cfg.icon;
          return (
            <div key={item.product_id} className={`flex items-center gap-4 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
              <Icon className={`w-5 h-5 flex-shrink-0 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.sku} {item.category ? `- ${item.category}` : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold text-lg ${cfg.color}`}>{item.days_to_rupture}j</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">stock: {item.current_qty}</p>
              </div>
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="text-xs text-gray-500 dark:text-gray-400">Vente/j</p>
                <p className="font-medium text-gray-700 dark:text-gray-300">{item.avg_daily_sales}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
