/** Payment methods breakdown — donut chart + table. */
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/currency';
import type { CashierPaymentMethods } from '@/api/types';

const METHOD_COLORS: Record<string, string> = {
  CASH: '#10b981', MOBILE_MONEY: '#3b82f6', BANK_TRANSFER: '#8b5cf6',
  CREDIT: '#f59e0b', CHEQUE: '#6b7280',
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; amount: string; percentage: number; count: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-900 dark:text-white">{d.label}</p>
      <p className="text-gray-600 dark:text-gray-300">{formatCurrency(parseFloat(d.amount))} ({d.percentage}%)</p>
      <p className="text-gray-500 dark:text-gray-400">{d.count} transaction(s)</p>
    </div>
  );
}

export default function PaymentMethodsChart({ methods }: { methods: CashierPaymentMethods }) {
  const data = methods.by_method;
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center text-sm text-gray-400">
        Aucun paiement enregistre cette periode.
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-4">Repartition des encaissements</p>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} dataKey="percentage" cx={65} cy={65} innerRadius={38} outerRadius={60} paddingAngle={2}>
              {data.map((entry) => (
                <Cell key={entry.method} fill={METHOD_COLORS[entry.method] ?? '#9ca3af'} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 w-full space-y-2">
          {data.map((entry) => (
            <div key={entry.method} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: METHOD_COLORS[entry.method] ?? '#9ca3af' }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{entry.label}</span>
                  <span className="font-medium text-gray-900 dark:text-white tabular-nums ml-2">
                    {formatCurrency(parseFloat(entry.amount))}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${entry.percentage}%`, backgroundColor: METHOD_COLORS[entry.method] ?? '#9ca3af' }} />
                </div>
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums w-8 text-right">{entry.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-right">
        Total : <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(parseFloat(methods.total))}</span>
      </p>
    </div>
  );
}
