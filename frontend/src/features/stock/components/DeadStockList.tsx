import { Archive } from 'lucide-react';
import type { DeadStockItem } from '@/api/types';

interface Props {
  items: DeadStockItem[];
}

function formatCurrency(val: string) {
  return `${new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 }).format(Number(val))} FCFA`;
}

export default function DeadStockList({ items }: Props) {
  const totalValue = items.reduce((acc, i) => acc + Number(i.stock_value), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Stock dormant (&gt;90 jours)</h3>
        </div>
        {totalValue > 0 && (
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full">
            {formatCurrency(String(totalValue))} immobilise
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-center py-10">
          <Archive className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aucun stock dormant detecte</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Produit</th>
                <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Categorie</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Qte</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Valeur</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Derniere vente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {items.map((item) => (
                <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="py-2.5">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{item.product_name}</p>
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  </td>
                  <td className="py-2.5 text-gray-500 dark:text-gray-400">{item.category || '-'}</td>
                  <td className="py-2.5 text-right font-medium text-gray-700 dark:text-gray-300">{item.current_qty}</td>
                  <td className="py-2.5 text-right font-medium text-amber-600 dark:text-amber-400">{formatCurrency(item.stock_value)}</td>
                  <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">
                    {item.days_since_last_sale !== null ? (
                      <span className="text-red-500 dark:text-red-400">{item.days_since_last_sale}j</span>
                    ) : (
                      <span className="text-red-500">Jamais vendu</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
