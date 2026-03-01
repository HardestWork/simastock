/** Detail view for a single credit account with ledger history and payment form. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { creditApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import type { CustomerAccount, CreditLedgerEntry, ScheduleStatus } from '@/api/types';

// ---------------------------------------------------------------------------
// Entry type labels (French)
// ---------------------------------------------------------------------------

const ENTRY_TYPE_LABELS: Record<string, string> = {
  SALE_ON_CREDIT: 'Vente a credit',
  CREDIT_PAYMENT: 'Paiement',
  ADJUSTMENT: 'Ajustement',
  REFUND_TO_CREDIT: 'Remboursement',
};

// ---------------------------------------------------------------------------
// Schedule status config
// ---------------------------------------------------------------------------

const SCHEDULE_STATUS: Record<ScheduleStatus, { label: string; classes: string }> = {
  PENDING: { label: 'En attente', classes: 'bg-gray-100 text-gray-700' },
  PARTIAL: { label: 'Partiel', classes: 'bg-blue-100 text-blue-700' },
  PAID: { label: 'Paye', classes: 'bg-emerald-100 text-emerald-700' },
  OVERDUE: { label: 'En retard', classes: 'bg-red-100 text-red-700' },
};

// ---------------------------------------------------------------------------
// Health helpers
// ---------------------------------------------------------------------------

function getHealthBanner(account: CustomerAccount) {
  const bal = parseFloat(account.balance);
  const lim = parseFloat(account.credit_limit);
  const avail = parseFloat(account.available_credit);

  if (lim > 0 && bal > lim) {
    return {
      icon: <AlertTriangle size={18} />,
      text: 'Depassement de limite',
      classes: 'bg-red-50 border border-red-200 text-red-700',
    };
  }
  if (lim > 0 && avail < lim * 0.2) {
    return {
      icon: <AlertTriangle size={18} />,
      text: 'Limite bientot atteinte',
      classes: 'bg-amber-50 border border-amber-200 text-amber-700',
    };
  }
  return {
    icon: <CheckCircle size={18} />,
    text: 'Compte en bonne sante',
    classes: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
  };
}

function getHealthColor(account: CustomerAccount) {
  const bal = parseFloat(account.balance);
  const lim = parseFloat(account.credit_limit);
  if (lim <= 0) return 'bg-gray-400';
  if (bal > lim) return 'bg-red-500';
  const avail = parseFloat(account.available_credit);
  if (avail < lim * 0.2) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ---------------------------------------------------------------------------
// Amount color helper for ledger entries
// ---------------------------------------------------------------------------

function getAmountColor(entry: CreditLedgerEntry) {
  const amt = parseFloat(entry.amount);
  if (amt > 0) return 'text-red-600';
  if (amt < 0) return 'text-emerald-600';
  return 'text-gray-700';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = id!;
  const queryClient = useQueryClient();

  // --- Payment form state ---
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [latestReceiptUrl, setLatestReceiptUrl] = useState<string | null>(null);

  // --- Queries ---
  const {
    data: account,
    isLoading: accountLoading,
    error: accountError,
  } = useQuery({
    queryKey: queryKeys.creditAccounts.detail(accountId),
    queryFn: () => creditApi.getAccount(accountId),
    enabled: !!accountId,
  });

  const { data: ledgerData } = useQuery({
    queryKey: queryKeys.creditLedger.list({ account: accountId, ordering: '-created_at', page_size: '50' }),
    queryFn: () => creditApi.ledger({ account: accountId, ordering: '-created_at', page_size: '50' }),
    enabled: !!accountId,
  });

  const { data: schedulesData } = useQuery({
    queryKey: queryKeys.paymentSchedules.list({ account: accountId }),
    queryFn: () => creditApi.schedules({ account: accountId }),
    enabled: !!accountId,
  });

  // --- Payment mutation ---
  const {
    mutate: submitPayment,
    isPending: paymentPending,
    error: paymentError,
  } = useMutation({
    mutationFn: () => {
      const payload: { amount: string; reference?: string } = { amount };
      if (reference.trim()) payload.reference = reference.trim();
      return creditApi.pay(accountId, payload);
    },
    onSuccess: (result) => {
      const receiptUrl =
        result.receipt_url ??
        (result.payment_entry?.id
          ? `/api/v1/credit-accounts/${accountId}/payments/${result.payment_entry.id}/receipt/`
          : null);
      toast.success(`Paiement credit enregistre: ${account?.customer_name ?? account?.customer ?? 'Client'} (${formatCurrency(amount)})`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.creditAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.creditAccounts.detail(accountId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.creditLedger.all });
      setAmount('');
      setReference('');
      setLatestReceiptUrl(receiptUrl);
      setSuccessMessage(`Paiement enregistre pour ${account?.customer_name ?? account?.customer ?? 'le client'}.`);
      setTimeout(() => setSuccessMessage(''), 4000);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  // --- Loading / error states ---
  if (accountLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Impossible de charger le compte credit.</p>
        <Link to="/credits" className="text-primary hover:underline text-sm mt-2 inline-block">
          Retour aux comptes
        </Link>
      </div>
    );
  }

  const balance = parseFloat(account.balance);
  const healthBanner = getHealthBanner(account);
  const ledgerEntries = ledgerData?.results ?? [];
  const schedules = schedulesData?.results ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link + Header */}
      <div className="mb-6">
        <Link
          to="/credits"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
        >
          <ChevronLeft size={16} />
          Retour
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          {account.customer_name ?? account.customer}
          <span className={`inline-block w-3 h-3 rounded-full ${getHealthColor(account)}`} />
        </h1>
        {account.customer_phone && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{account.customer_phone}</p>
        )}
      </div>

      {/* Health banner */}
      <div className={`rounded-lg px-4 py-3 mb-6 flex items-center gap-2 text-sm font-medium ${healthBanner.classes}`}>
        {healthBanner.icon}
        {healthBanner.text}
      </div>

      {/* Account info panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Informations du compte</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Limite de credit</span>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-100">{formatCurrency(account.credit_limit)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Solde</span>
            <p className={`text-lg font-semibold ${balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(account.balance)}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Disponible</span>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(account.available_credit)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Statut</span>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-100 flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${account.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {account.is_active ? 'Actif' : 'Inactif'}
            </p>
          </div>
        </div>
      </div>

      {/* Payment form */}
      {balance > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Enregistrer un paiement</h2>

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 mb-4 text-sm">
              <div>{successMessage}</div>
              {latestReceiptUrl && (
                <a
                  href={latestReceiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1 text-sm font-medium text-emerald-800 hover:underline"
                >
                  Imprimer le recu
                </a>
              )}
            </div>
          )}

          {Boolean(paymentError) && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
              {(paymentError as Error).message || 'Erreur lors du paiement.'}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="pay-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Montant <span className="text-red-500">*</span>
              </label>
              <input
                id="pay-amount"
                type="number"
                min="1"
                max={balance}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max ${formatCurrency(account.balance)}`}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="pay-ref" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reference
              </label>
              <input
                id="pay-ref"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optionnel"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => submitPayment()}
                disabled={paymentPending || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
                className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 whitespace-nowrap"
              >
                {paymentPending ? 'Traitement...' : 'Enregistrer le paiement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger history */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Info size={18} className="text-gray-400" />
            Historique des ecritures
          </h2>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Montant</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Solde apres</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Reference</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Recu</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    {ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${getAmountColor(entry)}`}>
                    {formatCurrency(entry.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(entry.balance_after)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {entry.reference || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {entry.entry_type === 'CREDIT_PAYMENT' ? (
                      <a
                        href={`/api/v1/credit-accounts/${accountId}/payments/${entry.id}/receipt/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Imprimer
                      </a>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {ledgerEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucune ecriture.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment schedules */}
      {schedules.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Echeancier</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Echeance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Montant du</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Paye</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Restant</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => {
                const due = parseFloat(schedule.amount_due);
                const paid = parseFloat(schedule.amount_paid);
                const remaining = due - paid;
                const statusConfig = SCHEDULE_STATUS[schedule.status];

                return (
                  <tr
                    key={schedule.id}
                    className={`border-b border-gray-50 dark:border-gray-700 ${schedule.status === 'OVERDUE' ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 text-gray-700">
                      {format(new Date(schedule.due_date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(schedule.amount_due)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(schedule.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(String(remaining))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.classes}`}>
                        {statusConfig.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

