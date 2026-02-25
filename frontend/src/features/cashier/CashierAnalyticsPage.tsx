/** Cashier self-analytics dashboard — reliability score, KPIs, anomalies, shifts. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cashierAnalyticsApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import ReliabilityGauge from './components/ReliabilityGauge';
import PaymentMethodsChart from './components/PaymentMethodsChart';
import CashierAnomalyBlock from './components/CashierAnomalyBlock';
import ShiftHistoryList from './components/ShiftHistoryList';

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function parsePeriod(p: string) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function prevMonth(p: string) { const { year, month } = parsePeriod(p); return month === 1 ? formatPeriod(year - 1, 12) : formatPeriod(year, month - 1); }
function nextMonth(p: string) { const { year, month } = parsePeriod(p); return month === 12 ? formatPeriod(year + 1, 1) : formatPeriod(year, month + 1); }

export default function CashierAnalyticsPage() {
  const now = new Date();
  const currentPeriod = formatPeriod(now.getFullYear(), now.getMonth() + 1);
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const [period, setPeriod] = useState(currentPeriod);
  const isCurrentMonth = period === currentPeriod;

  const query = useQuery({
    queryKey: ['cashier-analytics-dashboard', storeId, period],
    queryFn: () => cashierAnalyticsApi.dashboard({ store: storeId, period }),
    enabled: !!storeId,
    refetchInterval: isCurrentMonth ? 60000 : false,
  });

  const data = query.data;

  if (!storeId) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Analyse Caissier</h1>
            {data && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.cashier.name}</p>
            )}
          </div>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <button onClick={() => setPeriod(prevMonth(period))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-20 text-center">{period}</span>
          <button onClick={() => setPeriod(nextMonth(period))} disabled={isCurrentMonth} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {query.isLoading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-blue-600" />
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          Impossible de charger les donnees. Verifiez votre connexion.
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total encaisse', value: formatCurrency(parseFloat(data.kpis.total_collected)) },
              { label: 'Transactions', value: data.kpis.transaction_count.toString() },
              { label: 'Shifts', value: `${data.kpis.closed_shifts}/${data.kpis.shift_count}` },
              { label: 'Delai moy.', value: data.kpis.avg_delay_minutes > 0 ? `${data.kpis.avg_delay_minutes.toFixed(1)} min` : '-' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Score + Anomalies */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReliabilityGauge score={data.score} />
            <CashierAnomalyBlock risk={data.anomalies} />
          </div>

          {/* Payment methods */}
          <PaymentMethodsChart methods={data.payment_methods} />

          {/* Shift history */}
          <ShiftHistoryList shifts={data.shifts} />
        </>
      )}
    </div>
  );
}
