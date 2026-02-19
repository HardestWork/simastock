/** Recent alerts widget for the dashboard. */
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale/fr';
import type { Alert } from '@/api/types';

interface AlertsWidgetProps {
  alerts: Alert[];
  isLoading: boolean;
}

const severityDotColor: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500',
  INFO: 'bg-gray-400',
};

export default function AlertsWidget({ alerts, isLoading }: AlertsWidgetProps) {
  const visibleAlerts = alerts.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Bell size={20} className="text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Alertes recentes</h2>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && visibleAlerts.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">Aucune alerte</p>
      )}

      {/* Alert list */}
      {!isLoading && visibleAlerts.length > 0 && (
        <ul className="space-y-3">
          {visibleAlerts.map((alert) => (
            <li
              key={alert.id}
              className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
                !alert.is_read ? 'bg-blue-50/50' : ''
              }`}
            >
              {/* Severity dot */}
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  severityDotColor[alert.severity] ?? 'bg-gray-400'
                }`}
              />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                <p className="text-xs text-gray-500 line-clamp-1">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(alert.created_at), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Footer link */}
      {!isLoading && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <Link
            to="/alerts"
            className="text-sm text-primary hover:underline"
          >
            Voir toutes les alertes &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
