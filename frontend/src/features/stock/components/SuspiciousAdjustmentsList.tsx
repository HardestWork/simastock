import { ShieldAlert } from 'lucide-react';
import type { SuspiciousAdjustment } from '@/api/types';

interface Props {
  items: SuspiciousAdjustment[];
}

const TYPE_LABELS: Record<string, string> = {
  ADJUST: 'Ajustement',
  DAMAGE: 'Dommage',
};

export default function SuspiciousAdjustmentsList({ items }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-5 h-5 text-red-500" />
        <h3 className="font-semibold text-gray-800 dark:text-gray-200">Ajustements suspects</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">(|quantite| &gt;= 5)</span>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-10">
          <ShieldAlert className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aucun ajustement suspect ce mois</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.movement_id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.quantity < 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'}`}>
                <span className="text-sm font-bold">{item.quantity > 0 ? '+' : ''}{item.quantity}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  <span>{TYPE_LABELS[item.type] || item.type}</span>
                  {item.actor_name && <span>Par: {item.actor_name}</span>}
                  {item.reason && <span>"{item.reason}"</span>}
                </div>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {new Date(item.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
