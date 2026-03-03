/**
 * Chart widgets — PreAdmin-inspired card style with border + clean header.
 */
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
/*  Shared card wrapper                                                        */
/* -------------------------------------------------------------------------- */

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared Tooltip style                                                       */
/* -------------------------------------------------------------------------- */

const tooltipStyle = {
  backgroundColor: '#212B36',
  border: 'none',
  borderRadius: '8px',
  color: '#F9FAFB',
  fontSize: '12px',
  padding: '8px 12px',
};

/* -------------------------------------------------------------------------- */
/*  SalesTrendChart                                                            */
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
    <ChartCard title="Tendance des ventes">
      <ResponsiveContainer width="100%" height={270}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0F4C9A" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0F4C9A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={50} />
          <Tooltip
            formatter={(value) => [formatCurrency(value as number), 'Ventes']}
            labelFormatter={(label) => `${String(label)}`}
            contentStyle={tooltipStyle}
            cursor={{ stroke: '#0F4C9A', strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#0F4C9A"
            strokeWidth={2.5}
            fill="url(#salesGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  PaymentMethodChart                                                         */
/* -------------------------------------------------------------------------- */

interface PaymentMethodChartProps {
  data: Array<{ method: string; total: string; count: number }>;
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: '#059669',
  MOBILE_MONEY: '#0F4C9A',
  BANK_TRANSFER: '#7C3AED',
  CREDIT: '#D97706',
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
    <ChartCard title="Modes de paiement">
      <ResponsiveContainer width="100%" height={270}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
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
            formatter={(value) => [formatCurrency(value as number), '']}
            contentStyle={tooltipStyle}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  CategoryBarChart                                                           */
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
    <ChartCard title="CA par categorie">
      <ResponsiveContainer
        width="100%"
        height={Math.max(220, data.length * 44)}
      >
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 11, fill: '#646B72' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(value as number), 'Revenu']}
            contentStyle={tooltipStyle}
            cursor={{ fill: '#F9FAFB' }}
          />
          <Bar
            dataKey="revenue"
            fill="#0F4C9A"
            barSize={18}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  SellerBarChart                                                             */
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
    <ChartCard title="Ventes par vendeur">
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value) => [formatCurrency(value as number), 'Ventes']}
            contentStyle={tooltipStyle}
            cursor={{ fill: '#F9FAFB' }}
          />
          <Bar
            dataKey="sales"
            fill="#3EB780"
            barSize={32}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
