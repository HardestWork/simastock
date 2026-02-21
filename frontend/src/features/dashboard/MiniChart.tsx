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
import { formatCurrency } from '@/lib/currency';

/* -------------------------------------------------------------------------- */
/*  SalesTrendChart                                                           */
/* -------------------------------------------------------------------------- */

interface SalesTrendChartProps {
  data: Array<{ date: string; total: string; count: number }>;
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  const chartData = data.map((entry) => ({
    date: entry.date,
    total: parseFloat(entry.total),
    count: entry.count,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Tendance des ventes
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
            labelFormatter={(label) => `Date: ${String(label)}`}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#0F4C9A"
            fill="#0F4C9A"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  PaymentMethodChart                                                        */
/* -------------------------------------------------------------------------- */

interface PaymentMethodChartProps {
  data: Array<{ method: string; total: string; count: number }>;
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: '#10B981',
  MOBILE_MONEY: '#3B82F6',
  BANK_TRANSFER: '#8B5CF6',
  CREDIT: '#F59E0B',
};
const PAYMENT_METHOD_DEFAULT_COLOR = '#6B7280';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CREDIT: 'Credit',
  CHEQUE: 'Cheque',
};

export function PaymentMethodChart({ data }: PaymentMethodChartProps) {
  const chartData = data.map((entry) => ({
    name: PAYMENT_METHOD_LABELS[entry.method] ?? entry.method,
    value: parseFloat(entry.total),
    method: entry.method,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Modes de paiement
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            label={({ name }) => name ?? ''}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.method}
                fill={
                  PAYMENT_METHOD_COLORS[entry.method] ??
                  PAYMENT_METHOD_DEFAULT_COLOR
                }
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
          />
          <Legend verticalAlign="bottom" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  CategoryBarChart                                                          */
/* -------------------------------------------------------------------------- */

interface CategoryBarChartProps {
  data: Array<{
    category: string;
    total_revenue: string;
    total_quantity: number;
  }>;
}

export function CategoryBarChart({ data }: CategoryBarChartProps) {
  const chartData = data.map((entry) => ({
    name: entry.category,
    revenue: parseFloat(entry.total_revenue),
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Chiffre d'affaires par categorie
      </h2>
      <ResponsiveContainer
        width="100%"
        height={Math.max(200, data.length * 40)}
      >
        <BarChart layout="vertical" data={chartData}>
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
          />
          <Bar
            dataKey="revenue"
            fill="#0F4C9A"
            barSize={20}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SellerBarChart                                                            */
/* -------------------------------------------------------------------------- */

interface SellerBarChartProps {
  data: Array<{
    seller: string;
    total_sales: string;
    order_count: number;
  }>;
}

export function SellerBarChart({ data }: SellerBarChartProps) {
  const chartData = data.map((entry) => ({
    name: entry.seller,
    sales: parseFloat(entry.total_sales),
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Ventes par vendeur
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => formatCurrency(value as number)}
          />
          <Bar
            dataKey="sales"
            fill="#21A8F6"
            barSize={30}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
