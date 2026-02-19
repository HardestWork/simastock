/** Main dashboard page — role-aware with KPIs, charts, and AI insights. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportApi, analyticsApi, alertApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import { format, subDays } from 'date-fns';
import {
  DollarSign,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Package,
  Percent,
  Tag,
  CreditCard,
} from 'lucide-react';

import KpiCard from './KpiCard';
import PeriodSelector from './PeriodSelector';
import type { PeriodKey } from './PeriodSelector';
import { SalesTrendChart, PaymentMethodChart, CategoryBarChart, SellerBarChart } from './MiniChart';
import AlertsWidget from './AlertsWidget';
import AiInsightsPanel from './AiInsightsPanel';
import ForecastSection from './ForecastSection';
import StockTrendChart from './StockTrendChart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

function isManagerOrAdmin(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const showAdvanced = isManagerOrAdmin(role);

  // Period state
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const handlePeriodChange = (p: PeriodKey, from: string, to: string) => {
    setPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const storeId = currentStore?.id ?? '';

  // ---- Queries ----

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: queryKeys.kpis(storeId, dateFrom, dateTo),
    queryFn: () => reportApi.kpis({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const { data: salesReport } = useQuery({
    queryKey: queryKeys.salesReport(storeId, dateFrom, dateTo),
    queryFn: () => reportApi.sales({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    enabled: !!storeId && showAdvanced,
  });

  const { data: strategic, isLoading: strategicLoading } = useQuery({
    queryKey: queryKeys.analytics.strategic({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    queryFn: () => analyticsApi.strategicKpis({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    enabled: !!storeId && showAdvanced,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: queryKeys.alerts.list({ page_size: '5', is_read: 'false' }),
    queryFn: () => alertApi.list({ page_size: '5', is_read: 'false' }),
    enabled: !!storeId,
  });

  // Previous period KPIs for trend comparison
  const daysDiff = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const compFrom = format(subDays(new Date(dateFrom), daysDiff), 'yyyy-MM-dd');
  const compTo = format(subDays(new Date(dateTo), daysDiff), 'yyyy-MM-dd');
  const { data: prevKpis } = useQuery({
    queryKey: queryKeys.kpis(storeId, compFrom, compTo),
    queryFn: () => reportApi.kpis({ store: storeId, date_from: compFrom, date_to: compTo }),
    enabled: !!storeId && showAdvanced && period !== 'custom',
  });

  // ---- Trend computation ----
  function pctChange(current: string | number | undefined, prev: string | number | undefined): number | null {
    if (!showAdvanced || period === 'custom') return null;
    const c = typeof current === 'string' ? parseFloat(current) : (current ?? 0);
    const p = typeof prev === 'string' ? parseFloat(prev) : (prev ?? 0);
    if (p === 0) return c > 0 ? 100 : null;
    return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
  }

  // ---- Early returns ----

  if (!currentStore) {
    return (
      <div className="text-center py-12 text-gray-500">
        Aucun magasin selectionne.
      </div>
    );
  }

  if (kpisLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const revenueGrowth = strategic
    ? parseFloat(strategic.revenue_growth_pct)
    : pctChange(kpis?.total_sales, prevKpis?.total_sales);

  // ---- KPI cards (role-filtered) ----
  const allKpiCards = [
    {
      key: 'sales',
      label: "Chiffre d'affaires",
      value: formatCurrency(kpis?.total_sales ?? 0),
      icon: <DollarSign size={24} />,
      color: 'bg-blue-500',
      trend: revenueGrowth,
      roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER'],
    },
    {
      key: 'net_sales',
      label: 'Ventes nettes',
      value: formatCurrency(kpis?.net_sales ?? 0),
      icon: <TrendingUp size={24} />,
      color: 'bg-cyan-500',
      trend: pctChange(kpis?.net_sales, prevKpis?.net_sales),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'orders',
      label: 'Commandes',
      value: kpis?.total_orders ?? 0,
      icon: <ShoppingBag size={24} />,
      color: 'bg-emerald-500',
      trend: pctChange(kpis?.total_orders, prevKpis?.total_orders),
      roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER'],
    },
    {
      key: 'basket',
      label: 'Panier moyen',
      value: formatCurrency(kpis?.average_basket ?? 0),
      icon: <ShoppingCart size={24} />,
      color: 'bg-amber-500',
      trend: pctChange(kpis?.average_basket, prevKpis?.average_basket),
      roles: ['ADMIN', 'MANAGER', 'SALES'],
    },
    {
      key: 'margin',
      label: 'Marge brute',
      value: formatCurrency(kpis?.gross_margin ?? 0),
      icon: <Percent size={24} />,
      color: 'bg-teal-500',
      trend: pctChange(kpis?.gross_margin, prevKpis?.gross_margin),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'discounts',
      label: 'Remises',
      value: formatCurrency(kpis?.total_discounts ?? 0),
      icon: <Tag size={24} />,
      color: 'bg-orange-500',
      trend: pctChange(kpis?.total_discounts, prevKpis?.total_discounts),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'credit',
      label: 'Credits en cours',
      value: formatCurrency(kpis?.credit_outstanding ?? 0),
      icon: <CreditCard size={24} />,
      color: 'bg-rose-500',
      trend: null,
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'stock',
      label: 'Valeur stock',
      value: formatCurrency(kpis?.stock_value ?? 0),
      icon: <Package size={24} />,
      color: 'bg-purple-500',
      trend: null,
      roles: ['ADMIN', 'MANAGER', 'STOCKER'],
    },
  ];

  const visibleKpiCards = allKpiCards.filter((c) => role && c.roles.includes(role));

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <PeriodSelector
          value={period}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={handlePeriodChange}
        />
      </div>

      {/* Section 1 — KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleKpiCards.map((card) => (
          <KpiCard
            key={card.key}
            label={card.label}
            value={card.value}
            icon={card.icon}
            color={card.color}
            trend={card.trend}
          />
        ))}
      </div>

      {/* Section 2 — Charts (Admin/Manager) */}
      {showAdvanced && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {kpis?.sales_trend && kpis.sales_trend.length > 0 && (
            <SalesTrendChart data={kpis.sales_trend} />
          )}
          {salesReport?.payments_by_method && salesReport.payments_by_method.length > 0 && (
            <PaymentMethodChart data={salesReport.payments_by_method} />
          )}
          {salesReport?.by_category && salesReport.by_category.length > 0 && (
            <CategoryBarChart data={salesReport.by_category} />
          )}
          {salesReport?.by_seller && salesReport.by_seller.length > 0 && (
            <SellerBarChart data={salesReport.by_seller} />
          )}
        </div>
      )}

      {/* Sales trend for non-admin roles */}
      {!showAdvanced && kpis?.sales_trend && kpis.sales_trend.length > 0 && (
        <SalesTrendChart data={kpis.sales_trend} />
      )}

      {/* Section 3 — Top Products + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {kpis?.top_products && kpis.top_products.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top produits</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-gray-500 font-medium">#</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Produit</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Qte</th>
                    <th className="text-right py-2 text-gray-500 font-medium">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.top_products.map((product, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-medium">{product.product__name}</td>
                      <td className="py-2 text-right">{product.total_quantity}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(product.total_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AlertsWidget
          alerts={alertsData?.results ?? []}
          isLoading={alertsLoading}
        />
      </div>

      {/* Section 4 — Projections (Admin/Manager) */}
      {showAdvanced && (
        <>
          <ForecastSection storeId={storeId} />
          <StockTrendChart storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />
        </>
      )}

      {/* Section 5 — AI Insights (Admin/Manager) */}
      {showAdvanced && (
        <AiInsightsPanel data={strategic} isLoading={strategicLoading} />
      )}
    </div>
  );
}
