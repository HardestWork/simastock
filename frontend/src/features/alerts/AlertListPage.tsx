/** Alerts list page. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import { Bell, CheckCheck } from 'lucide-react';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => alertApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Alertes</h1>
        <button
          onClick={() => markAllMut.mutate()}
          disabled={markAllMut.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
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
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            <Bell size={32} className="mx-auto mb-2 text-gray-300" />
            Aucune alerte.
          </div>
        ) : (
          data?.results.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 ${
                !alert.is_read ? 'border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge type="severity" value={alert.severity} />
                  <span className="text-xs text-gray-500">
                    {new Date(alert.created_at).toLocaleString('fr-FR')}
                  </span>
                </div>
                <h3 className="text-sm font-medium">{alert.title}</h3>
                <p className="text-sm text-gray-500">{alert.message}</p>
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
