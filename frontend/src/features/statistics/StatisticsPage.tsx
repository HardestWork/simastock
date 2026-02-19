/** Statistiques page — daily profit, sales breakdown, and analytics. */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  DollarSign,
  TrendingUp,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Tag,
  ArrowUp,
  ArrowDown,
  Clock,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import KpiCard from '@/features/dashboard/KpiCard';
import PeriodSelector from '@/features/dashboard/PeriodSelector';
import type { PeriodKey } from '@/features/dashboard/PeriodSelector';
import type { DailyStatRow } from '@/api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const PAYMENT_COLORS: Record<string, string> = {
  CASH: '#22c55e',
  MOBILE_MONEY: '#3b82f6',
  BANK_TRANSFER: '#8b5cf6',
  CREDIT: '#f59e0b',
  CHECK: '#ec4899',
  OTHER: '#6b7280',
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CREDIT: 'Credit',
  CHECK: 'Cheque',
  OTHER: 'Autre',
};

type SortKey = keyof DailyStatRow;
type SortDir = 'asc' | 'desc';

function formatDateFr(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TodayProfitBanner({
  profit,
  revenue,
  nbSales,
  marginPct,
  totalItems,
}: {
  profit: string;
  revenue: string;
  nbSales: number;
  marginPct: string;
  totalItems: number;
}) {
  return (
    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={20} className="opacity-90" />
        <p className="text-sm font-medium opacity-90">Benefice du jour</p>
      </div>
      <p className="text-3xl font-bold mt-1">{formatCurrency(profit)}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm opacity-90">
        <span>CA: {formatCurrency(revenue)}</span>
        <span>{nbSales} vente{nbSales !== 1 ? 's' : ''}</span>
        <span>Marge: {marginPct}%</span>
        <span>{totalItems} article{totalItems !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function ProfitTrendChart({ data }: { data: DailyStatRow[] }) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: formatDateFr(d.date),
        CA: parseFloat(d.revenue),
        Benefice: parseFloat(d.profit),
      })),
    [data],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Tendance CA vs Benefice</h2>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value) => formatCurrency(value as number)} />
          <Legend />
          <Area type="monotone" dataKey="CA" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
          <Area type="monotone" dataKey="Benefice" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailySalesTable({
  data,
  summary,
}: {
  data: DailyStatRow[];
  summary: {
    total_revenue: string;
    nb_sales: number;
    total_profit: string;
    margin_pct: string;
    avg_basket: string;
    total_discounts: string;
    total_items: number;
  };
}) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let va: number | string = a[sortKey];
      let vb: number | string = b[sortKey];
      if (typeof va === 'string' && !isNaN(Number(va))) {
        va = parseFloat(va);
        vb = parseFloat(vb as string);
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ArrowUp size={12} className="inline ml-0.5" /> : <ArrowDown size={12} className="inline ml-0.5" />;
  }

  const thClass = 'px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <h2 className="text-lg font-semibold px-5 py-4 border-b border-gray-200">Ventes par jour</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={`text-left ${thClass}`} onClick={() => toggleSort('date')}>Date <SortIcon col="date" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('nb_sales')}>Ventes <SortIcon col="nb_sales" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('revenue')}>CA <SortIcon col="revenue" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('profit')}>Benefice <SortIcon col="profit" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('margin_pct')}>Marge % <SortIcon col="margin_pct" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('avg_basket')}>Panier moy. <SortIcon col="avg_basket" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('total_discounts')}>Remises <SortIcon col="total_discounts" /></th>
              <th className={`text-right ${thClass}`} onClick={() => toggleSort('total_items')}>Articles <SortIcon col="total_items" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{formatDateFr(row.date)}</td>
                <td className="px-4 py-3 text-right">{row.nb_sales}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(row.profit)}</td>
                <td className="px-4 py-3 text-right">{row.margin_pct}%</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.avg_basket)}</td>
                <td className="px-4 py-3 text-right text-orange-600">{formatCurrency(row.total_discounts)}</td>
                <td className="px-4 py-3 text-right">{row.total_items}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
            <tr>
              <td className="px-4 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right">{summary.nb_sales}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(summary.total_revenue)}</td>
              <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(summary.total_profit)}</td>
              <td className="px-4 py-3 text-right">{summary.margin_pct}%</td>
              <td className="px-4 py-3 text-right">{formatCurrency(summary.avg_basket)}</td>
              <td className="px-4 py-3 text-right text-orange-600">{formatCurrency(summary.total_discounts)}</td>
              <td className="px-4 py-3 text-right">{summary.total_items}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TopProductsByProfit({
  data,
}: {
  data: Array<{ product_name: string; qty_sold: number; revenue: string; profit: string }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <h2 className="text-lg font-semibold px-5 py-4 border-b border-gray-200">Top produits par benefice</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Produit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">CA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Benefice</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{p.product_name}</td>
                <td className="px-4 py-3 text-right">{p.qty_sold}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(p.revenue)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(p.profit)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">Aucune donnee</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentMethodPieChart({
  data,
}: {
  data: Array<{ method: string; total: string; count: number }>;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        name: PAYMENT_LABELS[d.method] ?? d.method,
        value: parseFloat(d.total),
        color: PAYMENT_COLORS[d.method] ?? '#6b7280',
      })),
    [data],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Methodes de paiement</h2>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value as number)} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-gray-400 text-center py-8">Aucune donnee</p>
      )}
    </div>
  );
}

function HourlyDistributionChart({
  data,
}: {
  data: Array<{ hour: number; nb_sales: number; revenue: string }>;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        hour: `${d.hour}h`,
        Ventes: d.nb_sales,
        CA: parseFloat(d.revenue),
      })),
    [data],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">Distribution horaire des ventes</h2>
      </div>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="Ventes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-gray-400 text-center py-8">Aucune donnee</p>
      )}
    </div>
  );
}

function BestWorstDayCards({
  bestDay,
  worstDay,
}: {
  bestDay: DailyStatRow | null;
  worstDay: DailyStatRow | null;
}) {
  if (!bestDay && !worstDay) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {bestDay && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={20} className="text-emerald-500" />
            <h3 className="font-semibold text-gray-900">Meilleur jour</h3>
          </div>
          <p className="text-sm text-gray-500">{formatDateFr(bestDay.date)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">CA:</span>{' '}
              <span className="font-semibold">{formatCurrency(bestDay.revenue)}</span>
            </div>
            <div>
              <span className="text-gray-500">Benefice:</span>{' '}
              <span className="font-semibold text-emerald-600">{formatCurrency(bestDay.profit)}</span>
            </div>
            <div>
              <span className="text-gray-500">Ventes:</span>{' '}
              <span className="font-semibold">{bestDay.nb_sales}</span>
            </div>
            <div>
              <span className="text-gray-500">Marge:</span>{' '}
              <span className="font-semibold">{bestDay.margin_pct}%</span>
            </div>
          </div>
        </div>
      )}
      {worstDay && bestDay?.date !== worstDay.date && (
        <div className="bg-white rounded-xl border border-orange-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={20} className="text-orange-500" />
            <h3 className="font-semibold text-gray-900">Jour le plus faible</h3>
          </div>
          <p className="text-sm text-gray-500">{formatDateFr(worstDay.date)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">CA:</span>{' '}
              <span className="font-semibold">{formatCurrency(worstDay.revenue)}</span>
            </div>
            <div>
              <span className="text-gray-500">Benefice:</span>{' '}
              <span className="font-semibold text-orange-600">{formatCurrency(worstDay.profit)}</span>
            </div>
            <div>
              <span className="text-gray-500">Ventes:</span>{' '}
              <span className="font-semibold">{worstDay.nb_sales}</span>
            </div>
            <div>
              <span className="text-gray-500">Marge:</span>{' '}
              <span className="font-semibold">{worstDay.margin_pct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StatisticsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [dateFrom, setDateFrom] = useState(() => format(new Date(Date.now() - 29 * 86400000), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(todayStr);

  const handlePeriodChange = (p: PeriodKey, from: string, to: string) => {
    setPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const storeId = currentStore?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dailyStatistics(storeId, dateFrom, dateTo),
    queryFn: () => reportApi.dailyStatistics({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    enabled: !!storeId,
    refetchInterval: 120_000,
  });

  // ---- Early returns ----

  if (!currentStore) {
    return (
      <div className="text-center py-12 text-gray-500">
        Aucun magasin selectionne.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        Aucune donnee disponible.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
        <PeriodSelector
          value={period}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={handlePeriodChange}
        />
      </div>

      {/* Today's profit banner */}
      <TodayProfitBanner
        profit={data.today.profit}
        revenue={data.today.revenue}
        nbSales={data.today.nb_sales}
        marginPct={data.today.margin_pct}
        totalItems={data.today.total_items}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={formatCurrency(data.summary.total_revenue)}
          icon={<DollarSign size={24} />}
          color="bg-blue-500"
        />
        <KpiCard
          label="Benefice total"
          value={formatCurrency(data.summary.total_profit)}
          icon={<TrendingUp size={24} />}
          color="bg-emerald-500"
        />
        <KpiCard
          label="Marge %"
          value={`${data.summary.margin_pct}%`}
          icon={<Percent size={24} />}
          color="bg-teal-500"
        />
        <KpiCard
          label="Commandes"
          value={data.summary.nb_sales}
          icon={<ShoppingBag size={24} />}
          color="bg-amber-500"
        />
        <KpiCard
          label="Panier moyen"
          value={formatCurrency(data.summary.avg_basket)}
          icon={<ShoppingCart size={24} />}
          color="bg-purple-500"
        />
        <KpiCard
          label="Remises"
          value={formatCurrency(data.summary.total_discounts)}
          icon={<Tag size={24} />}
          color="bg-orange-500"
        />
      </div>

      {/* Revenue vs Profit trend */}
      {data.daily.length > 1 && <ProfitTrendChart data={data.daily} />}

      {/* Daily sales table */}
      <DailySalesTable data={data.daily} summary={data.summary} />

      {/* Two columns: Top products + Payment method */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProductsByProfit data={data.top_products_by_profit} />
        <PaymentMethodPieChart data={data.by_payment_method} />
      </div>

      {/* Hourly distribution */}
      <HourlyDistributionChart data={data.hourly_distribution} />

      {/* Best / worst day */}
      <BestWorstDayCards bestDay={data.best_day} worstDay={data.worst_day} />
    </div>
  );
}
