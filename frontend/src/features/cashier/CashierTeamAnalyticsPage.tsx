/** Admin/Manager view — team cashier analytics. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cashierAnalyticsApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import CashierTeamBoard from './components/CashierTeamBoard';

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function parsePeriod(p: string) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function prevMonth(p: string) { const { year, month } = parsePeriod(p); return month === 1 ? formatPeriod(year - 1, 12) : formatPeriod(year, month - 1); }
function nextMonth(p: string) { const { year, month } = parsePeriod(p); return month === 12 ? formatPeriod(year + 1, 1) : formatPeriod(year, month + 1); }

export default function CashierTeamAnalyticsPage() {
  const now = new Date();
  const currentPeriod = formatPeriod(now.getFullYear(), now.getMonth() + 1);
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const [period, setPeriod] = useState(currentPeriod);
  const isCurrentMonth = period === currentPeriod;

  const query = useQuery({
    queryKey: ['cashier-analytics-team', storeId, period],
    queryFn: () => cashierAnalyticsApi.team({ store: storeId, period }),
    enabled: !!storeId,
    refetchInterval: isCurrentMonth ? 120000 : false,
  });

  if (!storeId) return <div className="text-center py-12 text-gray-500">Aucune boutique selectionnee.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Performance Caissiers</h1>
        </div>
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
          Acces refuse ou donnees indisponibles.
        </div>
      )}
      {query.data && <CashierTeamBoard team={query.data.team} />}
    </div>
  );
}
