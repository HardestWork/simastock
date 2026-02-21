/** Cashier dashboard — shift status, pending sales, payment processing. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashShiftApi, saleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import StatusBadge from '@/components/shared/StatusBadge';
import { DollarSign, Clock, AlertCircle, Banknote, Lock, CheckCircle, Smartphone, Building2, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';

export default function CashierDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentStore = useStoreStore((s) => s.currentStore);
  const [openingFloat, setOpeningFloat] = useState('');

  // Close shift form state
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);

  // Current shift
  const { data: shift, isLoading: shiftLoading } = useQuery({
    queryKey: queryKeys.cashShifts.current(currentStore?.id),
    queryFn: () => cashShiftApi.current(currentStore?.id),
    enabled: !!currentStore,
    retry: false,
  });

  // Pending sales
  const { data: pendingSales } = useQuery({
    queryKey: queryKeys.sales.list({ store: currentStore?.id ?? '', status: 'PENDING_PAYMENT' }),
    queryFn: () => saleApi.list({ store: currentStore?.id ?? '', status: 'PENDING_PAYMENT' }),
    enabled: !!currentStore && !!shift,
  });

  // Open shift mutation
  const openShiftMut = useMutation({
    mutationFn: () =>
      cashShiftApi.open({
        store: currentStore!.id,
        opening_float: openingFloat || '0',
      }),
    onSuccess: () => {
      toast.success('Session de caisse ouverte avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.cashShifts.all });
      setOpeningFloat('');
      setCloseSuccess(false);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
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
      toast.success('Session de caisse fermee avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.cashShifts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setShowCloseForm(false);
      setClosingCash('');
      setCloseNotes('');
      setCloseSuccess(true);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
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

  // No open shift — show open shift form (with optional success message from recent close)
  if (!shift) {
    return (
      <div className="max-w-md mx-auto mt-12">
        {closeSuccess && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-800">Session fermee avec succes</p>
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
          <button
            onClick={() => openShiftMut.mutate()}
            disabled={openShiftMut.isPending}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
          >
            {openShiftMut.isPending ? 'Ouverture...' : 'Ouvrir la session'}
          </button>
        </div>
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
                  Erreur: {((closeShiftMut.error as AxiosError)?.response?.data as any)?.detail ?? 'Impossible de fermer la session.'}
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
    </div>
  );
}
