/** Widget visibility toggle panel for the dashboard. */
import { X, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useDashboardPrefs } from './dashboard-prefs';

export default function DashboardConfig() {
  const { widgets, isConfigOpen, closeConfig, toggleWidget, resetDefaults } = useDashboardPrefs();

  if (!isConfigOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeConfig}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personnaliser le tableau de bord</h2>
          <button onClick={closeConfig} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Widget list */}
        <div className="px-6 py-4 space-y-2 max-h-96 overflow-y-auto">
          {widgets.map((w) => (
            <button
              key={w.key}
              onClick={() => toggleWidget(w.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                w.visible
                  ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 opacity-60'
              }`}
            >
              {w.visible ? (
                <Eye size={18} className="text-primary shrink-0" />
              ) : (
                <EyeOff size={18} className="text-gray-400 shrink-0" />
              )}
              <span className={`text-sm font-medium ${w.visible ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                {w.label}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={resetDefaults}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RotateCcw size={14} />
            Reinitialiser
          </button>
          <button
            onClick={closeConfig}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
