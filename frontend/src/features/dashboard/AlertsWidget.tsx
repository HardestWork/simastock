/** Recent alerts widget — PreAdmin card style. */
import { Link } from 'react-router-dom';
import { Bell, AlertCircle, AlertTriangle, Info, CheckCircle, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale/fr';
import type { Alert } from '@/api/types';

interface AlertsWidgetProps {
  alerts: Alert[];
  isLoading: boolean;
}

const SEVERITY_CONFIG: Record<string, {
  dot: string;
  badge: string;
  icon: React.ReactNode;
  label: string;
}> = {
  CRITICAL: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    icon: <AlertCircle size={12} />,
    label: 'Critique',
  },
  HIGH: {
    dot: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    icon: <AlertTriangle size={12} />,
    label: 'Eleve',
  },
  MEDIUM: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    icon: <AlertTriangle size={12} />,
    label: 'Moyen',
  },
  LOW: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    icon: <Info size={12} />,
    label: 'Faible',
  },
  INFO: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    icon: <Info size={12} />,
    label: 'Info',
  },
};

const DEFAULT_SEVERITY = SEVERITY_CONFIG.INFO;

export default function AlertsWidget({ alerts, isLoading }: AlertsWidgetProps) {
  const visibleAlerts = alerts.slice(0, 5);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Alertes recentes</h2>
        </div>
        {visibleAlerts.length > 0 && (
          <span className="text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
            {visibleAlerts.length}
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && visibleAlerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400 dark:text-gray-500">
          <CheckCircle size={32} strokeWidth={1.2} />
          <p className="text-sm font-semibold">Aucune alerte active</p>
        </div>
      )}

      {/* Alert list */}
      {!isLoading && visibleAlerts.length > 0 && (
        <ul className="divide-y divide-gray-50 dark:divide-gray-700 flex-1">
          {visibleAlerts.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity] ?? DEFAULT_SEVERITY;
            return (
              <li
                key={alert.id}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors"
              >
                {/* Severity dot */}
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{alert.title}</p>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{alert.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(alert.created_at), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer */}
      {!isLoading && (
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
          <Link
            to="/alerts"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline transition-colors"
          >
            Voir toutes les alertes
            <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
