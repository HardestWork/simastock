import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Package, ShieldCheck,
  AlertTriangle, AlertCircle, RefreshCw, Trophy, Star,
} from 'lucide-react';
import { dgApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import type { DGOrgAlert, DGTopSeller, DGTopCashier } from '@/api/types';

function fmt(val: string | number) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(val))} FCFA`;
}

const SEGMENT_COLORS: Record<string, string> = {
  EXCELLENT: '#10b981',
  BON: '#3b82f6',
  ACCEPTABLE: '#f59e0b',
  CRITIQUE: '#ef4444',
  SANTE: '#10b981',
  CORRECT: '#3b82f6',
  FRAGILE: '#f59e0b',
  FIABLE: '#10b981',
  SOLIDE: '#3b82f6',
};

function GlobalScoreGauge({ score, scores }: { score: number; scores: { sellers: number; cashiers: number; stock: number } }) {
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Bon' : score >= 50 ? 'Acceptable' : 'Critique';
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#3b82f6' : score >= 50 ? '#f59e0b' : '#ef4444';
  const radius = 60;
  const stroke = 12;
  const normalizedR = radius - stroke / 2;
  const circ = 2 * Math.PI * normalizedR;
  const offset = circ * (1 - score / 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-4">Score organisationnel global</h2>
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width={radius * 2 + 20} height={radius * 2 + 20} className="rotate-[-90deg]">
            <circle cx={radius + 10} cy={radius + 10} r={normalizedR} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
            <circle
              cx={radius + 10}
              cy={radius + 10}
              r={normalizedR}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">{score}</span>
            <span className="text-sm font-medium mt-1" style={{ color }}>{label}</span>
          </div>
        </div>
        <div className="flex-1 space-y-4 w-full">
          {[
            { key: 'sellers', label: 'Vendeurs', value: scores.sellers, weight: '40%', icon: Users },
            { key: 'cashiers', label: 'Caissiers', value: scores.cashiers, weight: '30%', icon: ShieldCheck },
            { key: 'stock', label: 'Stock', value: scores.stock, weight: '30%', icon: Package },
          ].map((item) => {
            const Icon = item.icon;
            const c = item.value >= 80 ? '#10b981' : item.value >= 65 ? '#3b82f6' : item.value >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className="text-xs text-gray-400">({item.weight})</span>
                  </div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{item.value}/100</span>
                </div>
                <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: c, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrgAlertCard({ alert }: { alert: DGOrgAlert }) {
  const isCritical = alert.severity === 'CRITICAL';
  const Icon = isCritical ? AlertCircle : AlertTriangle;
  return (
    <div className={`flex gap-3 p-4 rounded-lg border ${isCritical ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
      <div>
        <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{alert.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.detail}</p>
      </div>
      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 h-fit ${isCritical ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
        {isCritical ? 'Critique' : 'Alerte'}
      </span>
    </div>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#3b82f6' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: color }}>
      {Math.round(score)}
    </div>
  );
}

function TopPerformersPanel({ topSellers, topCashiers }: { topSellers: DGTopSeller[]; topCashiers: DGTopCashier[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Top Vendeurs</h3>
        </div>
        {topSellers.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Aucune donnee ce mois</p>
        ) : (
          <div className="space-y-3">
            {topSellers.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-300 dark:text-gray-600 w-5 text-center">{i + 1}</span>
                <ScoreDot score={s.score_360} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-200 truncate text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{s.current_tier_name} - {fmt(s.gross_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Top Caissiers</h3>
        </div>
        {topCashiers.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Aucune donnee ce mois</p>
        ) : (
          <div className="space-y-3">
            {topCashiers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-300 dark:text-gray-600 w-5 text-center">{i + 1}</span>
                <ScoreDot score={c.score} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-200 truncate text-sm">{c.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{c.segment} - {fmt(c.total_collected)} encaisse</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StockSummaryBar({ summary }: { summary: { health_score: number; segment: string; low_stock_count: number; dead_stock_count: number; critical_ruptures: number; total_stock_value: string } }) {
  const color = SEGMENT_COLORS[summary.segment] || '#6b7280';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Stock</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium" style={{ color }}>{summary.segment}</span>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{summary.health_score}/100</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Valeur stock', value: fmt(summary.total_stock_value), color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Stock bas', value: summary.low_stock_count, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Dormants', value: summary.dead_stock_count, color: 'text-orange-600 dark:text-orange-400' },
          { label: 'Ruptures critiques', value: summary.critical_ruptures, color: summary.critical_ruptures > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DGDashboardPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dg-dashboard', storeId, period],
    queryFn: () => dgApi.dashboard({ store: storeId, period }),
    enabled: !!storeId,
    staleTime: 120_000,
  });

  if (!storeId) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Selectionnez un magasin pour acceder au tableau de bord DG.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tableau de Bord DG</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Vue synthetique - {data?.team ? `${data.team.seller_count} vendeurs - ${data.team.cashier_count} caissiers` : '-'}
          </p>
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

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}
      {isError && (
        <div className="text-center py-10 text-red-500">Erreur lors du chargement du tableau de bord.</div>
      )}

      {data && !isLoading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Chiffre d'affaires", value: fmt(data.revenue.total_sales), sub: `${data.revenue.sale_count} ventes`, color: 'text-blue-600 dark:text-blue-400' },
              {
                label: 'Encaisse',
                value: fmt(data.revenue.total_collected),
                sub: `Recouvrement cohorte: ${data.revenue.collection_rate_cohort}%`,
                sub2: `Cash-in mois: ${data.revenue.cash_in_rate}%`,
                color: data.revenue.collection_rate_cohort >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
              },
              { label: 'Panier moyen', value: fmt(data.revenue.avg_basket), sub: `Annulations: ${data.revenue.cancellation_rate}%`, color: 'text-purple-600 dark:text-purple-400' },
              { label: 'Alertes org.', value: data.org_alerts.length, sub: `${data.org_alerts.filter((a) => a.severity === 'CRITICAL').length} critiques`, color: data.org_alerts.some((a) => a.severity === 'CRITICAL') ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400' },
            ].map((kpi, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{kpi.sub}</p>
                {'sub2' in kpi && kpi.sub2 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{kpi.sub2}</p>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlobalScoreGauge score={data.global_score} scores={data.scores} />
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Alertes organisationnelles
                {data.org_alerts.length > 0 && (<span className="ml-2 text-sm font-normal text-gray-400">({data.org_alerts.length})</span>)}
              </h3>
              {data.org_alerts.length === 0 ? (
                <div className="text-center py-8">
                  <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Aucune alerte organisationnelle</p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-64">
                  {data.org_alerts.map((alert, i) => (<OrgAlertCard key={i} alert={alert} />))}
                </div>
              )}
            </div>
          </div>

          <TopPerformersPanel topSellers={data.top_sellers} topCashiers={data.top_cashiers} />
          <StockSummaryBar summary={data.stock_summary} />
        </>
      )}
    </div>
  );
}
