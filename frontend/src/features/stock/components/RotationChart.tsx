import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { StockRotationItem } from '@/api/types';

interface Props {
  topRotation: StockRotationItem[];
  bottomRotation: StockRotationItem[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{d.product_name}</p>
      <p className="text-gray-500 dark:text-gray-400">SKU: {d.sku}</p>
      {d.category && <p className="text-gray-500 dark:text-gray-400">Categorie: {d.category}</p>}
      <p className="text-gray-700 dark:text-gray-300">Vendus: <strong>{d.sale_qty}</strong></p>
      <p className="text-gray-700 dark:text-gray-300">En stock: <strong>{d.current_qty}</strong></p>
      <p className="text-gray-700 dark:text-gray-300">Taux: <strong>{d.rotation_rate}</strong></p>
    </div>
  );
};

export default function RotationChart({ topRotation, bottomRotation }: Props) {
  const [tab, setTab] = useState<'top' | 'bottom'>('top');
  const data = tab === 'top' ? topRotation : bottomRotation;
  const color = tab === 'top' ? '#10b981' : '#f59e0b';

  const formatted = data.map((d) => ({
    ...d,
    name: d.product_name.length > 20 ? `${d.product_name.slice(0, 20)}...` : d.product_name,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200">Taux de rotation</h3>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button onClick={() => setTab('top')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${tab === 'top' ? 'bg-white dark:bg-gray-600 shadow text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>Top 10</button>
          <button onClick={() => setTab('bottom')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${tab === 'bottom' ? 'bg-white dark:bg-gray-600 shadow text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>Lents</button>
        </div>
      </div>
      {formatted.length === 0 ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">Aucune donnee disponible</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={formatted} layout="vertical" margin={{ left: 8, right: 40 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="rotation_rate" radius={[0, 4, 4, 0]}>
              {formatted.map((_, i) => <Cell key={i} fill={color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
        {tab === 'top'
          ? 'Produits les plus vendus par rapport au stock disponible'
          : 'Produits avec peu ou pas de ventes - risque de stock dormant'}
      </p>
    </div>
  );
}
