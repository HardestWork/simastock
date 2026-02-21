/** Alerts list page. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from '@/lib/toast';

export default function AlertListPage() {
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    ordering: '-created_at',
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.alerts.list(params),
    queryFn: () => alertApi.list(params),
    enabled: !!currentStore,
  });

  const markAllMut = useMutation({
    mutationFn: () => alertApi.markAllRead(),
    onSuccess: () => {
      toast.info('Toutes les alertes ont ete marquees comme lues.');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => alertApi.markRead(id),
    onSuccess: () => {
      toast.info('Alerte marquee comme lue.');
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alertes</h1>
        <button
          onClick={() => markAllMut.mutate()}
          disabled={markAllMut.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
        >
          <CheckCheck size={16} /> Tout marquer comme lu
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : data?.results.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
            <Bell size={32} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            Aucune alerte.
          </div>
        ) : (
          data?.results.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-4 ${
                !alert.is_read ? 'border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge type="severity" value={alert.severity} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(alert.created_at).toLocaleString('fr-FR')}
                  </span>
                </div>
                <h3 className="text-sm font-medium">{alert.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{alert.message}</p>
              </div>
              {!alert.is_read && (
                <button
                  onClick={() => markOneMut.mutate(alert.id)}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Marquer lu
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

