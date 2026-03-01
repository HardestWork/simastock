/** Cashier dashboard â€” shift status, pending sales, payment processing. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashShiftApi, saleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import { DollarSign, Clock, AlertCircle, Banknote, Lock, CheckCircle, Smartphone, Building2, CreditCard, History } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

const AUTO_REFRESH_MS = 10_000;

function formatElapsedSince(dateValue?: string | null, nowMs = Date.now()): string {
  if (!dateValue) return '--';
  const submittedMs = new Date(dateValue).getTime();
  if (Number.isNaN(submittedMs)) return '--';

  const diffSeconds = Math.max(0, Math.floor((nowMs - submittedMs) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ${diffMinutes % 60} min`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} j ${diffHours % 24} h`;
}

export default function CashierDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentStore = useStoreStore((s) => s.currentStore);
  const [openingFloat, setOpeningFloat] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const seenPendingIdsRef = useRef<Set<string> | null>(null);

  // Close shift form state
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);
  const currentShiftKey = queryKeys.cashShifts.current(currentStore?.id);
  const closedShiftParams: Record<string, string> = useMemo(
    () => ({
      store: currentStore?.id ?? '',
      status: 'CLOSED',
      ordering: '-closed_at',
      page_size: '10',
    }),
    [currentStore?.id],
  );
  const pendingSalesParams: Record<string, string> = useMemo(
    () => ({
      store: currentStore?.id ?? '',
      status_in: 'PENDING_PAYMENT,PARTIALLY_PAID',
      ordering: '-created_at',
      page_size: '100',
    }),
    [currentStore?.id],
  );

  // Current shift
  const { data: shift, isLoading: shiftLoading } = useQuery({
    queryKey: currentShiftKey,
    queryFn: async () => {
      try {
        return await cashShiftApi.current(currentStore?.id);
      } catch (err) {
        if ((err as any)?.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!currentStore,
    retry: false,
  });

  const { data: closedShifts, isLoading: closedShiftsLoading } = useQuery({
    queryKey: queryKeys.cashShifts.list(closedShiftParams),
    queryFn: () => cashShiftApi.list(closedShiftParams),
    enabled: !!currentStore,
  });

  // Pending sales
  const { data: pendingSales, refetch: refetchPendingSales } = useQuery({
    queryKey: queryKeys.sales.list(pendingSalesParams),
    queryFn: () => saleApi.list(pendingSalesParams),
    enabled: !!currentStore,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!currentStore?.id) return undefined;
    const timer = window.setInterval(() => {
      void refetchPendingSales();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [currentStore?.id, refetchPendingSales]);

  useEffect(() => {
    if (!currentStore?.id) return undefined;
    const onVisible = () => {
      if (!document.hidden) {
        void refetchPendingSales();
      }
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentStore?.id, refetchPendingSales]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    seenPendingIdsRef.current = null;
  }, [currentStore?.id]);

  useEffect(() => {
    const results = pendingSales?.results ?? [];
    const currentIds = new Set(results.map((sale) => sale.id));
    if (seenPendingIdsRef.current === null) {
      seenPendingIdsRef.current = currentIds;
      return;
    }

    const newlySubmitted = results.filter((sale) => !seenPendingIdsRef.current?.has(sale.id));
    if (newlySubmitted.length > 0) {
      if (newlySubmitted.length === 1) {
        toast.info(`Nouvelle vente soumise: ${newlySubmitted[0].invoice_number ?? 'sans numero'}`);
      } else {
        toast.info(`${newlySubmitted.length} nouvelles ventes soumises en caisse.`);
      }
    }
    seenPendingIdsRef.current = currentIds;
  }, [pendingSales?.results]);

  // Open shift mutation
  const openShiftMut = useMutation({
    mutationFn: () =>
      cashShiftApi.open({
        store: currentStore!.id,
        opening_float: openingFloat || '0',
      }),
    onSuccess: (openedShift) => {
      toast.success(`Session de caisse ouverte (${currentStore?.name ?? 'magasin courant'}).`);
      queryClient.setQueryData(currentShiftKey, openedShift);
      queryClient.invalidateQueries({ queryKey: queryKeys.cashShifts.all });
      setOpeningFloat('');
      setCloseSuccess(false);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // Close shift mutation
  const closeShiftMut = useMutation({
    mutationFn: () =>
      cashShiftApi.close(shift!.id, {
        closing_cash: closingCash || '0',
        notes: closeNotes || undefined,
      }),
    onSuccess: () => {
      toast.warning('Session de caisse fermee.');
      queryClient.setQueryData(currentShiftKey, null);
      queryClient.invalidateQueries({ queryKey: queryKeys.cashShifts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setShowCloseForm(false);
      setClosingCash('');
      setCloseNotes('');
      setCloseSuccess(true);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // Calculate variance preview
  const expectedCash = shift ? parseFloat(shift.expected_cash) || 0 : 0;
  const closingCashNum = parseFloat(closingCash) || 0;
  const variancePreview = closingCash ? closingCashNum - expectedCash : null;

  if (!currentStore) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Aucun magasin selectionne.</div>;
  }

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const closedSessionsPanel = (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <History size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sessions cloturees recentes</h2>
      </div>

      {closedShiftsLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : closedShifts?.results.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Ouverture</th>
                <th className="py-2 pr-3 font-medium">Fermeture</th>
                <th className="py-2 pr-3 font-medium text-right">Attendu</th>
                <th className="py-2 pr-3 font-medium text-right">Compte</th>
                <th className="py-2 pr-0 font-medium text-right">Ecart</th>
              </tr>
            </thead>
            <tbody>
              {closedShifts.results.map((s) => {
                const variance = parseFloat(s.variance ?? '0');
                return (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">
                      {new Date(s.opened_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">
                      {s.closed_at ? new Date(s.closed_at).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-200">
                      {formatCurrency(s.expected_cash)}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-200">
                      {s.closing_cash ? formatCurrency(s.closing_cash) : '—'}
                    </td>
                    <td
                      className={`py-2 pr-0 text-right font-medium ${
                        variance < 0
                          ? 'text-red-600'
                          : variance > 0
                            ? 'text-blue-600'
                            : 'text-emerald-600'
                      }`}
                    >
                      {variance > 0 ? '+' : ''}{formatCurrency(s.variance ?? '0')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aucune session cloturee pour ce magasin.</p>
      )}
    </div>
  );

  // No open shift â€” show open shift form (with optional success message from recent close)
  if (!shift) {
    return (
      <div className="space-y-6">
        <div className="max-w-md mx-auto mt-12">
          {closeSuccess && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Session de caisse cloturee</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Vous pouvez ouvrir une nouvelle session ci-dessous.
                </p>
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
            <AlertCircle size={48} className="mx-auto text-warning mb-4" />
            <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Aucune session ouverte</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Ouvrez une session de caisse pour commencer a encaisser.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 text-left">
                Fond de caisse (FCFA)
              </label>
              <input
                type="number"
                min="0"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                placeholder="0"
              />
            </div>
            <div className="mb-4 rounded-lg border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-left">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                Ventes en attente: {pendingSales?.count ?? 0}
              </p>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                Ouvrez une session pour traiter les ventes soumises.
              </p>
            </div>
            <button
              onClick={() => openShiftMut.mutate()}
              disabled={openShiftMut.isPending}
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
            >
              {openShiftMut.isPending ? 'Ouverture...' : 'Ouvrir la session'}
            </button>
          </div>
        </div>
        {closedSessionsPanel}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Caisse</h1>
        <StatusBadge type="shift" value={shift.status} />
      </div>

      {/* Payment breakdown cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <DollarSign size={20} className="text-emerald-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Ventes totales</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_sales)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Banknote size={20} className="text-green-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Especes</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_cash_payments)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Smartphone size={20} className="text-blue-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Mobile Money</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_mobile_payments)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Building2 size={20} className="text-purple-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Virement</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_bank_payments)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <CreditCard size={20} className="text-orange-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Credit</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_credit_payments)}</p>
          </div>
        </div>
      </div>

      {/* Session info */}
      <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-6">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-gray-400 dark:text-gray-500" />
          <span>Ouverture: {new Date(shift.opened_at).toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign size={14} className="text-gray-400 dark:text-gray-500" />
          <span>Fond de caisse: {formatCurrency(shift.opening_float)}</span>
        </div>
      </div>

      {/* Pending sales */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Ventes en attente ({pendingSales?.count ?? 0})
        </h2>
        {pendingSales?.results.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucune vente en attente.</p>
        ) : (
          <div className="space-y-3">
            {pendingSales?.results.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{sale.invoice_number}</span>
                  {sale.customer_name && (
                    <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">-- {sale.customer_name}</span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {new Date(sale.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span
                    className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    title={(sale.submitted_at ?? sale.created_at) ? new Date(sale.submitted_at ?? sale.created_at).toLocaleString('fr-FR') : ''}
                  >
                    Depuis {formatElapsedSince(sale.submitted_at ?? sale.created_at, nowMs)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sale.amount_due)}</span>
                  <button
                    onClick={() => navigate(`/cashier/payment/${sale.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-colors"
                  >
                    <Banknote size={14} />
                    Encaisser
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close shift section */}
      {shift.status === 'OPEN' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          {!showCloseForm ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fermer la session</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Cloturez votre session de caisse en fin de service.
                </p>
              </div>
              <button
                onClick={() => setShowCloseForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                <Lock size={16} />
                Fermer la session
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Fermer la session</h2>

              {/* Expected cash display */}
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Fond de caisse</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(shift.opening_float)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600 dark:text-gray-400">Encaissements especes</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(shift.totals.total_cash_payments)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                  <span>Montant attendu en caisse</span>
                  <span>{formatCurrency(shift.expected_cash)}</span>
                </div>
              </div>

              {/* Closing cash input */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Montant en caisse (FCFA)
                </label>
                <input
                  type="number"
                  min="0"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Comptez et saisissez le montant..."
                />
              </div>

              {/* Variance preview */}
              {variancePreview !== null && (
                <div className={`mb-3 p-3 rounded-lg border text-sm ${
                  variancePreview === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : variancePreview > 0
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex justify-between">
                    <span>Ecart</span>
                    <span className="font-bold">
                      {variancePreview > 0 ? '+' : ''}{formatCurrency(variancePreview.toString())}
                    </span>
                  </div>
                  <p className="text-xs mt-1">
                    {variancePreview === 0
                      ? 'Pas d\'ecart. La caisse est equilibree.'
                      : variancePreview > 0
                        ? 'Excedent de caisse.'
                        : 'Deficit de caisse.'}
                  </p>
                </div>
              )}

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (optionnel)
                </label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Observations, remarques..."
                />
              </div>

              {/* Error message */}
              {closeShiftMut.isError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  Erreur: {extractApiError(closeShiftMut.error, 'Impossible de fermer la session.')}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCloseForm(false);
                    setClosingCash('');
                    setCloseNotes('');
                  }}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => closeShiftMut.mutate()}
                  disabled={closeShiftMut.isPending || !closingCash}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  <Lock size={16} />
                  {closeShiftMut.isPending ? 'Fermeture...' : 'Confirmer la fermeture'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {closedSessionsPanel}
    </div>
  );
}

