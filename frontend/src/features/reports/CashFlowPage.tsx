/** Cash flow report — compares cash inflows (payments) vs outflows (expenses). */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { cashFlowApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import { TrendingUp } from 'lucide-react';

type GroupBy = 'day' | 'month';

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function CashFlowPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const defaults = getDefaultDates();

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', currentStore?.id, startDate, endDate, groupBy],
    queryFn: () =>
      cashFlowApi.get({
        store: currentStore!.id,
        start_date: startDate,
        end_date: endDate,
        group_by: groupBy,
      }),
    enabled: !!currentStore && !!startDate && !!endDate,
  });

  const net = data ? parseFloat(data.totals.net) : 0;
  const isNegative = net < 0;

  const chartData = data?.periods.map((p) => ({
    date: p.date,
    'Entrées': parseFloat(p.cash_in),
    'Sorties': parseFloat(p.cash_out),
    'Net': parseFloat(p.net),
  })) ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={22} className="text-primary" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Trésorerie</h1>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Du</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Au</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Regrouper par</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="day">Jour</option>
            <option value="month">Mois</option>
          </select>
        </div>
        {/* Quick presets */}
        <div className="flex gap-2 ml-auto">
          {[
            { label: 'Ce mois', fn: () => { const d = getDefaultDates(); setStartDate(d.start); setEndDate(d.end); setGroupBy('day'); } },
            { label: '3 mois', fn: () => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
              setStartDate(start.toISOString().slice(0, 10));
              setEndDate(now.toISOString().slice(0, 10));
              setGroupBy('month');
            }},
          ].map(({ label, fn }) => (
            <button
              key={label}
              onClick={fn}
              className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-gray-700 dark:text-gray-300"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Entrées</p>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(data.totals.cash_in)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Sorties</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(data.totals.cash_out)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Solde Net</p>
            <p className={`text-xl font-bold ${isNegative ? 'text-red-600' : 'text-primary'}`}>
              {formatCurrency(data.totals.net)}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
            Aucune donnee pour cette periode.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  if (groupBy === 'month') {
                    const d = new Date(v + 'T00:00:00');
                    return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
                  }
                  const d = new Date(v + 'T00:00:00');
                  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                }}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                formatter={(value) => [formatCurrency(value as number), '']}
                labelFormatter={(label) => `Date : ${label}`}
              />
              <Legend />
              <Bar dataKey="Entrées" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Sorties" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Line dataKey="Net" stroke="#6366f1" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      {data && data.periods.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Entrées</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Sorties</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => {
                const netVal = parseFloat(p.net);
                return (
                  <tr key={p.date} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(p.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: groupBy === 'month' ? '2-digit' : undefined,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatCurrency(p.cash_in)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(p.cash_out)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${netVal < 0 ? 'text-red-600' : 'text-primary'}`}>
                      {formatCurrency(p.net)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100">Total</td>
                <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(data.totals.cash_in)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatCurrency(data.totals.cash_out)}</td>
                <td className={`px-4 py-3 text-right ${isNegative ? 'text-red-600' : 'text-primary'}`}>
                  {formatCurrency(data.totals.net)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
