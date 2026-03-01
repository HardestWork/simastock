/** Detail/edit page for an inventory count. */
import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, ClipboardList, Search, Save, CheckSquare } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type { CountStatus } from '@/api/types';

const STATUS_LABELS: Record<CountStatus, string> = {
  DRAFT: 'Brouillon',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Termine',
  CANCELLED: 'Annule',
};

const STATUS_CLASSES: Record<CountStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: CountStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function VarianceCell({ variance }: { variance: number | null }) {
  if (variance === null) return <span className="text-gray-400 dark:text-gray-500">-</span>;
  if (variance === 0) return <span className="text-green-600 font-medium">0</span>;
  if (variance < 0)
    return <span className="text-red-600 font-medium">{variance}</span>;
  return <span className="text-orange-500 font-medium">+{variance}</span>;
}

export default function CountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [searchFilter, setSearchFilter] = useState('');
  const [editedQtys, setEditedQtys] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const {
    data: count,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.counts.detail(id!),
    queryFn: () => stockApi.getCount(id!),
    enabled: !!id,
    // Reset local edits when data refreshes from the server
  });

  const { mutate: saveLines, isPending: isSaving } = useMutation({
    mutationFn: (lines: { id: string; counted_qty: number }[]) =>
      stockApi.updateCountLines(id!, { lines }),
    onSuccess: (_result, lines) => {
      toast.info(`Inventaire enregistre: ${lines.length} ligne(s) mise(s) a jour.`);
      setSaveError('');
      setEditedQtys({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.counts.detail(id!) });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setSaveError("Une erreur est survenue lors de l'enregistrement.");
    },
  });

  const { mutate: completeCount, isPending: isCompleting } = useMutation({
    mutationFn: () => stockApi.completeCount(id!),
    onSuccess: () => {
      toast.success(`Inventaire termine: ${countedLines}/${totalLines} ligne(s) comptee(s).`);
      setCompleteError('');
      setShowCompleteConfirm(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.counts.detail(id!) });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
      setCompleteError("Une erreur est survenue lors de la finalisation de l'inventaire.");
    },
  });

  const isInProgress = count?.status === 'IN_PROGRESS';

  // Merge server data with local edits for display
  const mergedLines = useMemo(() => {
    if (!count) return [];
    return count.lines.map((line) => {
      const edited = editedQtys[line.id];
      const displayQty = edited !== undefined ? edited : (line.counted_qty ?? 0);
      const variance =
        edited !== undefined
          ? edited - line.system_qty
          : line.variance;
      return { ...line, displayQty, variance };
    });
  }, [count, editedQtys]);

  // Filter by product name client-side
  const filteredLines = useMemo(() => {
    if (!searchFilter.trim()) return mergedLines;
    const lower = searchFilter.toLowerCase();
    return mergedLines.filter((l) => l.product_name.toLowerCase().includes(lower));
  }, [mergedLines, searchFilter]);

  // Summary stats
  const totalLines = count?.lines.length ?? 0;
  const countedLines = mergedLines.filter(
    (l) => l.displayQty !== null && l.displayQty !== undefined
  ).length;
  const remainingLines = totalLines - countedLines;

  function handleQtyChange(lineId: string, value: string) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setEditedQtys((prev) => ({ ...prev, [lineId]: parsed }));
    } else if (value === '') {
      setEditedQtys((prev) => ({ ...prev, [lineId]: 0 }));
    }
  }

  function handleSave() {
    setSaveError('');
    const changedLines = Object.entries(editedQtys).map(([lineId, qty]) => ({
      id: lineId,
      counted_qty: qty,
    }));
    if (changedLines.length === 0) return;
    saveLines(changedLines);
  }

  function handleComplete() {
    setCompleteError('');
    setShowCompleteConfirm(true);
  }

  function runCompleteConfirmed() {
    setShowCompleteConfirm(false);
    completeCount();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !count) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        <p>Impossible de charger l'inventaire.</p>
        <Link
          to="/stock/counts"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          Retour aux inventaires
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/stock/counts"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
          >
            <ChevronLeft size={14} />
            Retour aux inventaires
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList size={22} />
            Inventaire #{id!.substring(0, 8).toUpperCase()}
          </h1>
          <div className="mt-1">
            <StatusBadge status={count.status} />
          </div>
        </div>

        {/* Action buttons */}
        {isInProgress && (
          <div className="flex gap-2 flex-wrap">
            {saveError && (
              <p className="text-xs text-red-600 self-center">{saveError}</p>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || Object.keys(editedQtys).length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <CheckSquare size={16} />
              {isCompleting ? 'Finalisation...' : "Terminer l'inventaire"}
            </button>
          </div>
        )}
      </div>

      {/* Complete error */}
      {completeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {completeError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main table â€” takes 3/4 width on large screens */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search filter */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrer par nom de produit..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Lines table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Produit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Systeme</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Compte</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Ecart</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => (
                  <tr key={line.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{line.product_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{line.system_qty}</td>
                    <td className="px-4 py-3 text-right">
                      {isInProgress ? (
                        <input
                          type="number"
                          min={0}
                          value={
                            editedQtys[line.id] !== undefined
                              ? editedQtys[line.id]
                              : (line.counted_qty ?? 0)
                          }
                          onChange={(e) => handleQtyChange(line.id, e.target.value)}
                          className="w-24 text-right px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none ml-auto dark:bg-gray-700 dark:text-gray-100"
                        />
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {line.counted_qty !== null ? line.counted_qty : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VarianceCell variance={line.variance} />
                    </td>
                  </tr>
                ))}
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {searchFilter ? 'Aucun produit trouve pour cette recherche.' : 'Aucune ligne dans cet inventaire.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4 sticky top-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recapitulatif</h2>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Statut</span>
                <div className="mt-1">
                  <StatusBadge status={count.status} />
                </div>
              </div>

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cree le</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {format(new Date(count.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cree par</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {count.created_by_name ?? '-'}
                </p>
              </div>

              {count.completed_at && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Termine le</span>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                    {format(new Date(count.completed_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              )}

              {count.notes && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{count.notes}</p>
                </div>
              )}

              <hr className="border-gray-100 dark:border-gray-700" />

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Lignes comptees
                </span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {countedLines} / {totalLines}
                </p>
              </div>

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Lignes restantes
                </span>
                <p
                  className={`text-sm font-medium mt-1 ${
                    remainingLines > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}
                >
                  {remainingLines}
                </p>
              </div>

              {/* Progress bar */}
              <div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: totalLines > 0 ? `${Math.round((countedLines / totalLines) * 100)}%` : '0%',
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                  {totalLines > 0 ? Math.round((countedLines / totalLines) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showCompleteConfirm}
        title="Terminer cet inventaire ?"
        message="Cette action est irreversible et appliquera les ajustements de stock sur les ecarts."
        confirmLabel="Terminer"
        tone="warning"
        loading={isCompleting}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={runCompleteConfirmed}
      />
    </div>
  );
}

