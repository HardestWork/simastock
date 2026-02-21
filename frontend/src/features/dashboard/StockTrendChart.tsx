/** Stock value trend chart using KPISnapshot data. */
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
import { reportApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';

interface StockTrendChartProps {
  storeId: string;
  dateFrom: string;
  dateTo: string;
}

export default function StockTrendChart({ storeId, dateFrom, dateTo }: StockTrendChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stockTrend(storeId, dateFrom, dateTo),
    queryFn: () => reportApi.stockTrend({ store: storeId, date_from: dateFrom, date_to: dateTo }),
    enabled: !!storeId,
  });

  const chartData = (data?.trend ?? []).map((entry) => ({
    date: entry.date,
    stock_value: parseFloat(entry.stock_value),
    gross_margin: parseFloat(entry.gross_margin),
  }));

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Evolution de la valeur du stock
      </h2>
      <ResponsiveContainer width="100%" height={300}>
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
            dataKey="stock_value"
            name="Valeur stock"
            stroke="#8B5CF6"
            fill="#8B5CF6"
            fillOpacity={0.1}
          />
          <Area
            type="monotone"
            dataKey="gross_margin"
            name="Marge brute"
            stroke="#F59E0B"
            fill="#F59E0B"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
