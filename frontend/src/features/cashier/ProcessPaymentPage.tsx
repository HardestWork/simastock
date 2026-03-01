/** Payment processing page â€” allows the cashier to record payments for a sale. */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saleApi, paymentApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import type { PaymentMethod } from '@/api/types';
import {
  ArrowLeft,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentLine {
  id: number;
  method: PaymentMethod;
  amount: string;
  reference: string;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'CASH', label: 'Especes', icon: Banknote },
  { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Virement bancaire', icon: Building2 },
  { value: 'CREDIT', label: 'Credit', icon: CreditCard },
  { value: 'CHEQUE', label: 'Cheque', icon: CreditCard },
];

const METHOD_LABELS: Record<PaymentMethod | string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
  CREDIT: 'Credit',
  CHEQUE: 'Cheque',
};

let nextLineId = 1;

function createEmptyLine(): PaymentLine {
  return { id: nextLineId++, method: 'CASH', amount: '', reference: '' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProcessPaymentPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [lines, setLines] = useState<PaymentLine[]>(() => [createEmptyLine()]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch sale details
  const {
    data: sale,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.sales.detail(saleId!),
    queryFn: () => saleApi.get(saleId!),
    enabled: !!saleId,
  });

  // Auto-submit DRAFT sales (e.g. converted from a quote before auto-submit fix)
  const autoSubmitAttempted = useRef(false);
  const submitMut = useMutation({
    mutationFn: (id: string) => saleApi.submit(id),
    onSuccess: () => {
      toast.info(`Vente envoyee en caisse: ${sale?.invoice_number ?? saleId ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.detail(saleId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  useEffect(() => {
    if (sale && sale.status === 'DRAFT' && !autoSubmitAttempted.current) {
      autoSubmitAttempted.current = true;
      submitMut.mutate(sale.id);
    }
  }, [sale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch existing payments for this sale (for partially-paid sales)
  const { data: existingPaymentsData } = useQuery({
    queryKey: queryKeys.payments.list({ sale: saleId! }),
    queryFn: () => paymentApi.list({ sale: saleId! }),
    enabled: !!saleId,
  });

  const existingPayments = existingPaymentsData?.results ?? [];

  // Payment mutation
  const payMutation = useMutation({
    mutationFn: (payload: { sale_id: string; payments: Array<{ method: string; amount: string; reference?: string }> }) =>
      paymentApi.create(payload),
    onSuccess: () => {
      toast.dismiss();
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashShifts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.creditAccounts.all });
      navigate(`/cashier/receipt/${saleId}`);
    },
    onError: (err: unknown) => {
      const msg = extractApiError(err);
      toast.error(msg);
      setSubmitError(msg);
    },
  });

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const amountDue = sale ? parseFloat(sale.amount_due) : 0;

  const totalEntered = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0),
    [lines],
  );

  const remaining = amountDue - totalEntered;

  // Cash lines can overpay (change is given back)
  const hasCashLine = lines.some((l) => l.method === 'CASH');
  const change = totalEntered > amountDue && hasCashLine ? totalEntered - amountDue : 0;

  // The form is valid if the total entered covers the amount due.
  // Cash is allowed to exceed (the overage is change).
  // Without cash, we require exact match.
  const canSubmit = useMemo(() => {
    if (!sale || lines.length === 0) return false;
    // Every line must have a positive amount
    if (lines.some((l) => !l.amount || parseFloat(l.amount) <= 0)) return false;
    // Total must cover the due amount (or exceed with cash)
    if (totalEntered < amountDue) return false;
    if (totalEntered > amountDue && !hasCashLine) return false;
    return true;
  }, [sale, lines, totalEntered, amountDue, hasCashLine]);

  // ---------------------------------------------------------------------------
  // Line management
  // ---------------------------------------------------------------------------

  const addLine = () => setLines((prev) => [...prev, createEmptyLine()]);

  const removeLine = (id: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));

  const updateLine = (id: number, field: keyof PaymentLine, value: string) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    );

  const fillExact = (lineId: number) => {
    // Fills the line with the remaining amount (accounting for other lines)
    const otherTotal = lines
      .filter((l) => l.id !== lineId)
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const fill = Math.max(0, amountDue - otherTotal);
    updateLine(lineId, 'amount', fill.toString());
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = () => {
    if (!sale || !canSubmit) return;
    setSubmitError(null);

    const payments = lines.map((l) => ({
      method: l.method,
      // For cash overpayment, only send the amount due portion to the backend
      // (the backend handles change calculation)
      amount: l.method === 'CASH' && change > 0
        ? (parseFloat(l.amount) - change).toFixed(2)
        : parseFloat(l.amount).toFixed(2),
      ...(l.reference ? { reference: l.reference } : {}),
    }));

    payMutation.mutate({ sale_id: sale.id, payments });
  };

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Show loading while auto-submitting a DRAFT sale
  if (sale && sale.status === 'DRAFT') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-sm text-gray-500">Soumission de la vente en caisse...</p>
        {submitMut.isError && (
          <div className="max-w-md text-center mt-4">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>Impossible de soumettre la vente. Verifiez qu'elle contient un client et des articles.</span>
            </div>
            <button
              onClick={() => navigate('/cashier')}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Retour a la caisse
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Vente introuvable</h2>
        <p className="text-sm text-gray-500 mb-4">
          Impossible de charger les details de cette vente.
        </p>
        <button
          onClick={() => navigate('/cashier')}
          className="text-sm text-primary hover:underline"
        >
          Retour a la caisse
        </button>
      </div>
    );
  }

  // Guard: sale already settled — cannot process payment again
  if (sale.status === 'PAID' || sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
    const settled = {
      PAID: { icon: CheckCircle2, color: 'text-green-400', title: 'Vente deja payee', msg: 'Cette vente a deja ete entierement reglée.' },
      CANCELLED: { icon: AlertCircle, color: 'text-gray-400', title: 'Vente annulee', msg: 'Cette vente a ete annulee et ne peut plus etre encaissee.' },
      REFUNDED: { icon: AlertCircle, color: 'text-gray-400', title: 'Vente remboursee', msg: 'Cette vente a ete remboursee et ne peut plus etre encaissee.' },
    }[sale.status];
    const Icon = settled.icon;
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <Icon size={48} className={`mx-auto mb-4 ${settled.color}`} />
        <h2 className="text-lg font-semibold mb-2">{settled.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{settled.msg}</p>
        <button
          onClick={() => navigate('/cashier')}
          className="text-sm text-primary hover:underline"
        >
          Retour a la caisse
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/cashier')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Encaissement</h1>
          <p className="text-sm text-gray-500">
            Facture {sale.invoice_number}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ====== LEFT: Sale details ====== */}
        <div className="space-y-4">
          {/* Customer & meta info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Details de la vente
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Client:</span>{' '}
                <span className="font-medium">{sale.customer_name ?? 'Client comptoir'}</span>
              </div>
              <div>
                <span className="text-gray-500">Vendeur:</span>{' '}
                <span className="font-medium">{sale.seller_name ?? '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Date:</span>{' '}
                <span className="font-medium">
                  {new Date(sale.created_at).toLocaleString('fr-FR')}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Statut:</span>{' '}
                <span className="font-medium">
                  {sale.status === 'PENDING_PAYMENT'
                    ? 'En attente'
                    : sale.status === 'PARTIALLY_PAID'
                      ? 'Paiement partiel'
                      : sale.status}
                </span>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Articles
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-500 text-left">
                    <th className="pb-2 font-medium">Produit</th>
                    <th className="pb-2 font-medium text-right">Qte</th>
                    <th className="pb-2 font-medium text-right">Prix unit.</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-2">{item.product_name}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sous-total</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
              {parseFloat(sale.discount_amount) > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Remise</span>
                  <span>-{formatCurrency(sale.discount_amount)}</span>
                </div>
              )}
              {parseFloat(sale.tax_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Taxes</span>
                  <span>{formatCurrency(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-gray-700 pt-2">
                <span>Total</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
              {parseFloat(sale.amount_paid) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Deja paye</span>
                  <span>{formatCurrency(sale.amount_paid)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg text-primary border-t border-gray-200 dark:border-gray-700 pt-2">
                <span>Reste a payer</span>
                <span>{formatCurrency(sale.amount_due)}</span>
              </div>
            </div>
          </div>

          {/* Previous payments (for partially-paid sales) */}
          {existingPayments.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Paiements precedents
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-500 text-left">
                      <th className="pb-2 font-medium">Mode</th>
                      <th className="pb-2 font-medium text-right">Montant</th>
                      <th className="pb-2 font-medium">Reference</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="py-2">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(payment.amount)}</td>
                        <td className="py-2 text-gray-600">{payment.reference || 'â€”'}</td>
                        <td className="py-2 text-gray-600">
                          {new Date(payment.created_at).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ====== RIGHT: Payment form ====== */}
        <div className="space-y-4">
          {/* Payment lines */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Paiements
              </h2>
              <button
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark transition-colors"
              >
                <Plus size={14} />
                Ajouter un mode
              </button>
            </div>

            <div className="space-y-4">
              {lines.map((line, idx) => {
                const methodMeta = PAYMENT_METHODS.find((m) => m.value === line.method);
                const Icon = methodMeta?.icon ?? Banknote;
                return (
                  <div
                    key={line.id}
                    className="border border-gray-100 dark:border-gray-700 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Icon size={16} />
                        Paiement {idx + 1}
                      </div>
                      {lines.length > 1 && (
                        <button
                          onClick={() => removeLine(line.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Method */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Mode de paiement
                      </label>
                      <select
                        value={line.method}
                        onChange={(e) => updateLine(line.id, 'method', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Montant (FCFA)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                          placeholder="0"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => fillExact(line.id)}
                          className="px-3 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors whitespace-nowrap"
                          title="Remplir avec le montant restant"
                        >
                          Montant exact
                        </button>
                      </div>
                    </div>

                    {/* Reference (non-cash only) */}
                    {line.method !== 'CASH' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Reference
                        </label>
                        <input
                          type="text"
                          value={line.reference}
                          onChange={(e) => updateLine(line.id, 'reference', e.target.value)}
                          placeholder="NÂ° de transaction..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary & submit */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Recapitulatif
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Montant du</span>
                <span className="font-medium">{formatCurrency(amountDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total saisi</span>
                <span className={`font-medium ${totalEntered >= amountDue ? 'text-green-600' : 'text-orange-600'}`}>
                  {formatCurrency(totalEntered)}
                </span>
              </div>

              {remaining > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Reste a percevoir</span>
                  <span>{formatCurrency(remaining)}</span>
                </div>
              )}

              {change > 0 && (
                <div className="flex justify-between text-blue-600 font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
                  <span>Monnaie a rendre</span>
                  <span>{formatCurrency(change)}</span>
                </div>
              )}
            </div>

            {/* Error message */}
            {submitError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || payMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {payMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Traitement en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Valider le paiement
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
