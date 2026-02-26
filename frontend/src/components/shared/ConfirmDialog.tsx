import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type ConfirmTone = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  loading = false,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-blue-600 hover:bg-blue-700';

  const iconClass =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-blue-600';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3">
            <span className={iconClass}>
              <AlertTriangle size={18} />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{message}</p>
            </div>
          </div>

          {children && <div className="px-4 pt-3">{children}</div>}

          <div className="p-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`px-3 py-2 rounded-lg text-sm text-white disabled:opacity-60 ${confirmClass}`}
            >
              {loading ? 'Traitement...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
