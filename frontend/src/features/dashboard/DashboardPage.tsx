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
  SlidersHorizontal,
  Store,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import KpiCard from './KpiCard';
import PeriodSelector from './PeriodSelector';
import type { PeriodKey } from './PeriodSelector';
import { SalesTrendChart, PaymentMethodChart, CategoryBarChart, SellerBarChart } from './MiniChart';
import AlertsWidget from './AlertsWidget';
import AiInsightsPanel from './AiInsightsPanel';
import ForecastSection from './ForecastSection';
import StockTrendChart from './StockTrendChart';
import { useDashboardPrefs } from './dashboard-prefs';
import DashboardConfig from './DashboardConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

function isManagerOrAdmin(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

// ---------------------------------------------------------------------------
// DashCount card — PreAdmin "dash-count" style (colored solid background)
// ---------------------------------------------------------------------------
interface DashCountProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  bg: string;       // e.g. "bg-primary"
  shadow: string;   // e.g. "shadow-blue-200"
}

function DashCount({ label, value, icon, bg, shadow }: DashCountProps) {
  return (
    <div
      className={`${bg} rounded-lg p-5 flex items-center justify-between text-white shadow-lg ${shadow} min-h-[100px] transition-transform duration-200 hover:scale-[1.02]`}
    >
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-sm text-white/80 mt-1">{label}</p>
      </div>
      <div className="text-white/80 transition-transform duration-300 group-hover:scale-125">
        {icon}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const showAdvanced = isManagerOrAdmin(role);
  const { isVisible, openConfig } = useDashboardPrefs();

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
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400 dark:text-gray-500">
        <Store size={48} strokeWidth={1.2} />
        <p className="text-base font-semibold">Aucun magasin selectionne.</p>
      </div>
    );
  }

  if (kpisLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
        </div>
      </div>
    );
  }

  const revenueGrowth = strategic
    ? parseFloat(strategic.revenue_growth_pct)
    : pctChange(kpis?.total_sales, prevKpis?.total_sales);

  // ---- KPI cards (role-filtered) — PreAdmin dash-widget style ----
  const allKpiCards = [
    {
      key: 'sales',
      label: "Chiffre d'affaires",
      value: formatCurrency(kpis?.total_sales ?? 0),
      icon: <DollarSign size={22} />,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-500',
      trend: revenueGrowth,
      roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'SALES_CASHIER'],
    },
    {
      key: 'net_sales',
      label: 'Ventes nettes',
      value: formatCurrency(kpis?.net_sales ?? 0),
      icon: <TrendingUp size={22} />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-500',
      trend: pctChange(kpis?.net_sales, prevKpis?.net_sales),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'orders',
      label: 'Commandes',
      value: kpis?.total_orders ?? 0,
      icon: <ShoppingBag size={22} />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600',
      trend: pctChange(kpis?.total_orders, prevKpis?.total_orders),
      roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'SALES_CASHIER'],
    },
    {
      key: 'basket',
      label: 'Panier moyen',
      value: formatCurrency(kpis?.average_basket ?? 0),
      icon: <ShoppingCart size={22} />,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-500',
      trend: pctChange(kpis?.average_basket, prevKpis?.average_basket),
      roles: ['ADMIN', 'MANAGER', 'SALES', 'SALES_CASHIER'],
    },
    {
      key: 'margin',
      label: 'Marge brute',
      value: formatCurrency(kpis?.gross_margin ?? 0),
      icon: <Percent size={22} />,
      iconBg: 'bg-violet-100 dark:bg-violet-900/30',
      iconColor: 'text-violet-600',
      trend: pctChange(kpis?.gross_margin, prevKpis?.gross_margin),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'discounts',
      label: 'Remises',
      value: formatCurrency(kpis?.total_discounts ?? 0),
      icon: <Tag size={22} />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-500',
      trend: pctChange(kpis?.total_discounts, prevKpis?.total_discounts),
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'credit',
      label: 'Credits en cours',
      value: formatCurrency(kpis?.credit_outstanding ?? 0),
      icon: <CreditCard size={22} />,
      iconBg: 'bg-pink-100 dark:bg-pink-900/30',
      iconColor: 'text-pink-500',
      trend: null,
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      key: 'stock',
      label: 'Valeur stock',
      value: formatCurrency(kpis?.stock_value ?? 0),
      icon: <Package size={22} />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600',
      trend: null,
      roles: ['ADMIN', 'MANAGER', 'STOCKER'],
    },
  ];

  const visibleKpiCards = allKpiCards.filter((c) => role && c.roles.includes(role));

  // ---- Period label ----
  const periodLabel: Record<PeriodKey, string> = {
    today: "Aujourd'hui",
    '7d': '7 derniers jours',
    '30d': '30 derniers jours',
    month: 'Ce mois',
    year: 'Cette annee',
    custom: `${dateFrom} — ${dateTo}`,
  };

  // ---- Render ----
  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-gray-100">
              Tableau de bord
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {currentStore.name} &middot; {periodLabel[period]}
            </p>
          </div>
          <button
            onClick={openConfig}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 bg-white dark:bg-gray-800 shadow-sm transition-colors shrink-0"
          >
            <SlidersHorizontal size={16} />
            <span className="hidden sm:inline">Personnaliser</span>
          </button>
        </div>
        <PeriodSelector
          value={period}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={handlePeriodChange}
        />
      </div>

      {/* ── STOCKER — alertes en premier ── */}
      {role === 'STOCKER' && isVisible('alerts') && (
        <AlertsWidget alerts={alertsData?.results ?? []} isLoading={alertsLoading} />
      )}

      {/* ── Section 1 — KPI Cards (dash-widget style) ── */}
      {isVisible('kpis') && visibleKpiCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleKpiCards.map((card) => (
            <KpiCard
              key={card.key}
              label={card.label}
              value={card.value}
              icon={card.icon}
              iconBg={card.iconBg}
              iconColor={card.iconColor}
              trend={card.trend}
            />
          ))}
        </div>
      )}

      {/* ── Section 2 — Dash-Count row (Admin/Manager) ── */}
      {showAdvanced && isVisible('kpis') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashCount
            label="Total Commandes"
            value={kpis?.total_orders ?? 0}
            icon={<ShoppingBag size={40} strokeWidth={1.5} />}
            bg="bg-primary"
            shadow="shadow-blue-200 dark:shadow-none"
          />
          <DashCount
            label="Panier moyen"
            value={formatCurrency(kpis?.average_basket ?? 0)}
            icon={<ShoppingCart size={40} strokeWidth={1.5} />}
            bg="bg-cyan-500"
            shadow="shadow-cyan-200 dark:shadow-none"
          />
          <DashCount
            label="Credits en cours"
            value={formatCurrency(kpis?.credit_outstanding ?? 0)}
            icon={<CreditCard size={40} strokeWidth={1.5} />}
            bg="bg-gray-800 dark:bg-gray-700"
            shadow="shadow-gray-300 dark:shadow-none"
          />
          <DashCount
            label="Valeur stock"
            value={formatCurrency(kpis?.stock_value ?? 0)}
            icon={<Package size={40} strokeWidth={1.5} />}
            bg="bg-emerald-500"
            shadow="shadow-emerald-200 dark:shadow-none"
          />
        </div>
      )}

      {/* ── SALES / CASHIER / SALES_CASHIER — raccourcis ── */}
      {(role === 'SALES' || role === 'CASHIER' || role === 'SALES_CASHIER') && (
        <div className="flex flex-wrap gap-3">
          {(role === 'SALES' || role === 'SALES_CASHIER') && (
            <Link
              to="/pos"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-primary-dark transition-colors"
            >
              <ShoppingCart size={16} />
              Nouvelle vente (POS)
            </Link>
          )}
          {(role === 'CASHIER' || role === 'SALES_CASHIER') && (
            <Link
              to="/cashier"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <DollarSign size={16} />
              Ouvrir la caisse
            </Link>
          )}
        </div>
      )}

      {/* ── Section 3 — Charts (Admin/Manager) ── */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {isVisible('salesTrend') && kpis?.sales_trend && kpis.sales_trend.length > 0 && (
            <SalesTrendChart data={kpis.sales_trend} />
          )}
          {isVisible('paymentMethod') && salesReport?.payments_by_method && salesReport.payments_by_method.length > 0 && (
            <PaymentMethodChart data={salesReport.payments_by_method} />
          )}
          {isVisible('categoryBar') && salesReport?.by_category && salesReport.by_category.length > 0 && (
            <CategoryBarChart data={salesReport.by_category} />
          )}
          {isVisible('sellerBar') && salesReport?.by_seller && salesReport.by_seller.length > 0 && (
            <SellerBarChart data={salesReport.by_seller} />
          )}
        </div>
      )}

      {/* Sales trend for non-admin roles */}
      {!showAdvanced && isVisible('salesTrend') && kpis?.sales_trend && kpis.sales_trend.length > 0 && (
        <SalesTrendChart data={kpis.sales_trend} />
      )}

      {/* ── Section 4 — Top Products + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {isVisible('topProducts') && kpis?.top_products && kpis.top_products.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Top Produits</h2>
              <Link
                to="/sales"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full pread-table">
                <thead>
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Produit</th>
                    <th className="text-right">Qte</th>
                    <th className="text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.top_products.map((product, i) => (
                    <tr key={i}>
                      <td>
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {i + 1}
                        </span>
                      </td>
                      <td className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[180px]">
                        {product.product__name}
                      </td>
                      <td className="text-right text-gray-600 dark:text-gray-300">
                        {product.total_quantity}
                      </td>
                      <td className="text-right font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(product.total_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isVisible('alerts') && (
          <AlertsWidget
            alerts={alertsData?.results ?? []}
            isLoading={alertsLoading}
          />
        )}
      </div>

      {/* ── Section 5 — Projections (Admin/Manager) ── */}
      {showAdvanced && (
        <>
          {isVisible('forecast') && <ForecastSection storeId={storeId} />}
          {isVisible('stockTrend') && <StockTrendChart storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />}
        </>
      )}

      {/* ── Section 6 — AI Insights (Admin/Manager) ── */}
      {showAdvanced && isVisible('aiInsights') && (
        <AiInsightsPanel data={strategic} isLoading={strategicLoading} />
      )}

      <DashboardConfig />
    </div>
  );
}
