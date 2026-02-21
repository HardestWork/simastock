/** Forecast projections section: revenue & profit chart + summary cards. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, DollarSign, BarChart3, Package } from 'lucide-react';
import { analyticsApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';

interface ForecastSectionProps {
  storeId: string;
}

type HorizonKey = '30' | '90' | '365';

const horizonOptions: { key: HorizonKey; label: string }[] = [
  { key: '30', label: '30 jours' },
  { key: '90', label: '90 jours' },
  { key: '365', label: '12 mois' },
];

export default function ForecastSection({ storeId }: ForecastSectionProps) {
  const [horizon, setHorizon] = useState<HorizonKey>('30');

  const queryParams = { store: storeId, horizon_days: horizon };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.forecastSummary(queryParams),
    queryFn: () => analyticsApi.forecastSummary(queryParams),
    enabled: !!storeId,
  });

  const chartData = (data?.daily ?? []).map((d) => ({
    date: d.date,
    revenue: parseFloat(d.predicted_revenue),
    profit: parseFloat(d.predicted_profit),
  }));

  return (
    <section>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Projections</h2>
        </div>

        {/* Horizon selector */}
        <div className="flex items-center gap-1">
          {horizonOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setHorizon(opt.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                horizon === opt.key
                  ? 'bg-primary text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!isLoading && data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="bg-blue-500 text-white p-3 rounded-lg">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">CA prevu</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(data.totals.predicted_revenue)}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="bg-emerald-500 text-white p-3 rounded-lg">
                <BarChart3 size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Benefice prevu</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(data.totals.predicted_profit)}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="bg-purple-500 text-white p-3 rounded-lg">
                <Package size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Quantite prevue</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {Math.round(data.totals.predicted_qty)} unites
                </p>
              </div>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Previsions de CA et benefice
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    labelFormatter={(label) => `Date: ${String(label)}`}
                  />
                  <Legend verticalAlign="top" />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="CA prevu"
                    stroke="#0F4C9A"
                    fill="#0F4C9A"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Benefice prevu"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.1}
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
              Aucune prevision disponible pour cette periode.
            </p>
          )}
        </div>
      )}

      {!isLoading && !data && (
        <p className="text-sm text-gray-400 py-6 text-center">
          Previsions non disponibles.
        </p>
      )}
    </section>
  );
}
