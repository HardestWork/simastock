/** Printable payment receipt page. */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { saleApi, paymentApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { ChevronLeft, Printer } from 'lucide-react';
import type { PaymentMethod } from '@/api/types';

const METHOD_LABELS: Record<PaymentMethod | string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
  CREDIT: 'Credit',
  CHEQUE: 'Cheque',
};

export default function PaymentReceiptPage() {
  const { saleId } = useParams<{ saleId: string }>();

  const {
    data: sale,
    isLoading: saleLoading,
    isError: saleError,
  } = useQuery({
    queryKey: queryKeys.sales.detail(saleId!),
    queryFn: () => saleApi.get(saleId!),
    enabled: !!saleId,
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: queryKeys.payments.list({ sale: saleId! }),
    queryFn: () => paymentApi.list({ sale: saleId! }),
    enabled: !!saleId,
  });

  const isLoading = saleLoading || paymentsLoading;
  const payments = paymentsData?.results ?? [];
  const latestPaymentDate = payments.length
    ? new Date(
      payments
        .map((p) => new Date(p.created_at).getTime())
        .reduce((max, t) => (t > max ? t : max), 0),
    )
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (saleError || !sale) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-500">Recu introuvable ou une erreur s'est produite.</p>
        <Link
          to="/cashier"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Retour a la caisse
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Top navigation -- hidden when printing */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          to="/cashier"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
        >
          <ChevronLeft size={16} />
          Retour
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Printer size={15} />
          Imprimer
        </button>
      </div>

      {/* Document card */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:p-0">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">
            RECU DE PAIEMENT
          </h1>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8 border border-gray-200 rounded-lg p-4 print:border-gray-300">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Facture
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {sale.invoice_number ?? '—'}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {latestPaymentDate ? 'Date paiement' : 'Date vente'}
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {(latestPaymentDate ?? new Date(sale.created_at)).toLocaleString('fr-FR')}
            </p>
            {latestPaymentDate && (
              <p className="text-xs text-gray-500 mt-0.5">
                Vente: {new Date(sale.created_at).toLocaleString('fr-FR')}
              </p>
            )}
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Client
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {sale.customer_name || '—'}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Vendeur
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {sale.seller_name || '—'}
            </p>
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-hidden border border-gray-200 rounded-lg print:border-gray-300 mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 print:bg-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Produit</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Qte</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Prix unit.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
              {sale.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Aucun article.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals section */}
        <div className="flex justify-end mb-8">
          <div className="border border-gray-200 rounded-lg p-4 min-w-[280px] print:border-gray-300">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Sous-total</span>
                <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
              </div>
              {parseFloat(sale.discount_amount) > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Remise</span>
                  <span>-{formatCurrency(sale.discount_amount)}</span>
                </div>
              )}
              {parseFloat(sale.tax_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxes</span>
                  <span>{formatCurrency(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
                <span>Total</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paye</span>
                <span>{formatCurrency(sale.amount_paid)}</span>
              </div>
              {parseFloat(sale.amount_due) > 0 && (
                <div className="flex justify-between font-bold text-red-600 border-t border-gray-200 pt-2">
                  <span>Reste</span>
                  <span>{formatCurrency(sale.amount_due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payments table */}
        {payments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Paiements
            </h2>
            <div className="overflow-hidden border border-gray-200 rounded-lg print:border-gray-300">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 print:bg-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Mode</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Montant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {METHOD_LABELS[payment.method] ?? payment.method}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {payment.reference || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(payment.created_at).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-500 italic">Merci pour votre achat!</p>
        </div>
      </div>
    </div>
  );
}
