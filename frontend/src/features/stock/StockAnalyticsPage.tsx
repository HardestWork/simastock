import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, TrendingUp, AlertTriangle, Archive, ShieldAlert, RefreshCw } from 'lucide-react';
import { stockAnalyticsApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import StockHealthGauge from './components/StockHealthGauge';
import RotationChart from './components/RotationChart';
import DeadStockList from './components/DeadStockList';
import RuptureRiskList from './components/RuptureRiskList';
import SuspiciousAdjustmentsList from './components/SuspiciousAdjustmentsList';

type Tab = 'sante' | 'rotation' | 'dormant' | 'rupture' | 'ajustements';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'sante', label: 'Sante', icon: Package },
  { id: 'rotation', label: 'Rotation', icon: TrendingUp },
  { id: 'dormant', label: 'Stock dormant', icon: Archive },
  { id: 'rupture', label: 'Ruptures', icon: AlertTriangle },
  { id: 'ajustements', label: 'Ajustements', icon: ShieldAlert },
];

function formatCurrency(val: string) {
  return `${new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 }).format(Number(val))} FCFA`;
}

export default function StockAnalyticsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const currentStoreId = currentStore?.id;
  const [tab, setTab] = useState<Tab>('sante');
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stock-analytics-dashboard', currentStoreId, period],
    queryFn: () => stockAnalyticsApi.dashboard({ store: currentStoreId!, period }),
    enabled: !!currentStoreId,
    staleTime: 60_000,
  });

  if (!currentStoreId) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Selectionnez un magasin pour voir l'analyse du stock.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analyse du Stock</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Intelligence stock - rotation, dormance et risques</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Produits en stock', value: data.kpis.total_products, sub: `${data.kpis.total_sku_count} SKU total`, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Valeur stock (cout)', value: formatCurrency(data.kpis.total_stock_value), sub: `Marge pot. ${formatCurrency(data.kpis.potential_margin)}`, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Stock bas / rupture', value: `${data.kpis.low_stock_count} / ${data.kpis.out_of_stock_count}`, sub: 'Sous seuil / a zero', color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Stock dormant', value: data.kpis.dead_stock_count, sub: 'Sans vente depuis 90j', color: 'text-red-600 dark:text-red-400' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.id === 'rupture' && data && data.rupture_risk.filter((r) => r.urgency === 'CRITICAL').length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {data.rupture_risk.filter((r) => r.urgency === 'CRITICAL').length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}
      {isError && (
        <div className="text-center py-10 text-red-500">Erreur lors du chargement des donnees.</div>
      )}

      {data && !isLoading && (
        <div>
          {tab === 'sante' && <StockHealthGauge score={data.score} />}
          {tab === 'rotation' && <RotationChart topRotation={data.top_rotation} bottomRotation={data.bottom_rotation} />}
          {tab === 'dormant' && <DeadStockList items={data.dead_stock} />}
          {tab === 'rupture' && <RuptureRiskList items={data.rupture_risk} />}
          {tab === 'ajustements' && <SuspiciousAdjustmentsList items={data.suspicious_adjustments} />}
        </div>
      )}
    </div>
  );
}
