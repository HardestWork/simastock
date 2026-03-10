/** Activity Summary page — shows time each user spent on the app per day. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Users, Eye, CalendarDays } from 'lucide-react';
import apiClient from '@/api/client';
import type { ActivitySummaryUser } from '../types';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

export default function ActivitySummaryPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: users, isLoading } = useQuery({
    queryKey: ['activity-summary', date],
    queryFn: async () => {
      const res = await apiClient.get<{ date: string; results: ActivitySummaryUser[] }>(
        `ai/activity/summary/?date=${date}`
      );
      return res.data.results;
    },
  });

  const totalMinutes = users?.reduce((sum, u) => sum + u.total_minutes, 0) ?? 0;
  const totalViews = users?.reduce((sum, u) => sum + u.page_views, 0) ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Activite des utilisateurs</h1>
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-gray-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Users size={16} />
            <span className="text-xs font-medium">Utilisateurs actifs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{users?.length ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Clock size={16} />
            <span className="text-xs font-medium">Temps total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatDuration(totalMinutes * 60)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Eye size={16} />
            <span className="text-xs font-medium">Pages vues</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalViews}</p>
        </div>
      </div>

      {/* User table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Utilisateur</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Role</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Temps actif</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Pages</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Chargement...</td></tr>
            ) : !users || users.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucune activite pour cette date.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{u.user_name}</td>
                  <td className="px-5 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                    {formatDuration(u.total_seconds)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">{u.page_views}</td>
                  <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">{u.sessions}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
