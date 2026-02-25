import type { SellerDashboard } from '@/api/types';
import { formatCurrency } from '@/lib/currency';
import { ShoppingCart, CreditCard, XCircle, Receipt } from 'lucide-react';

interface Props {
  stats: SellerDashboard['statistics'];
}

export default function StatsCards({ stats }: Props) {
  const items = [
    {
      label: 'Ventes validées',
      value: stats.sale_count,
      icon: <ShoppingCart size={18} className="text-blue-500" />,
      format: (v: number) => String(v),
    },
    {
      label: 'Panier moyen',
      value: parseFloat(stats.avg_basket),
      icon: <Receipt size={18} className="text-purple-500" />,
      format: (v: number) => formatCurrency(v),
    },
    {
      label: 'Annulations',
      value: stats.cancellation_count,
      icon: <XCircle size={18} className="text-red-500" />,
      format: (v: number) => String(v),
    },
    {
      label: 'Crédit recouvré',
      value: parseFloat(stats.credit_recovered),
      icon: <CreditCard size={18} className="text-emerald-500" />,
      format: (v: number) => formatCurrency(v),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
            {item.icon}
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {item.format(item.value as number)}
          </p>
        </div>
      ))}
    </div>
  );
}
