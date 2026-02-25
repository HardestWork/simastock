/** Product mix widget — revenue by category + top products. */
import type { ProductMix } from '@/api/types';
import { formatCurrency } from '@/lib/currency';

interface Props { data: ProductMix }

export default function ProductMixWidget({ data }: Props) {
  const { by_category, top_products, total_items, total_revenue } = data;
  const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-teal-500'];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{total_items}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Articles vendus</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(total_revenue)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Chiffre d'affaires</p>
        </div>
      </div>

      {/* Categories chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Par categorie
        </h3>
        {by_category.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucune vente ce mois.</p>
        ) : (
          <div className="space-y-3">
            {by_category.map((cat, i) => (
              <div key={cat.category}>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{cat.category}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatCurrency(cat.revenue)} ({cat.pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${COLORS[i % COLORS.length]} rounded-full transition-all duration-700`}
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top products */}
      {top_products.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Top 5 produits
          </h3>
          <div className="space-y-2">
            {top_products.map((p, i) => (
              <div key={p.product_name} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <span className="text-gray-700 dark:text-gray-300 truncate max-w-[140px]">{p.product_name}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(p.revenue)}</span>
                  <span className="text-gray-400 text-xs ml-2">x{p.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
