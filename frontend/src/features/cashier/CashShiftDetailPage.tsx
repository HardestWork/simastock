/** Cash shift detail page — shows full breakdown of a closed shift. */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cashShiftApi, saleApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { ArrowLeft, Clock, Banknote, CreditCard, Smartphone, Receipt, FileText } from 'lucide-react';
import type { Sale } from '@/api/types';

export default function CashShiftDetailPage() {
  const { shiftId } = useParams<{ shiftId: string }>();

  const { data: shift, isLoading } = useQuery({
    queryKey: ['cash-shifts', shiftId],
    queryFn: () => cashShiftApi.get(shiftId!),
    enabled: !!shiftId,
  });

  // Fetch payments made during this shift
  const { data: shiftSales } = useQuery({
    queryKey: ['sales', 'shift', shiftId],
    queryFn: () => saleApi.list({ shift: shiftId!, page_size: '200' }),
    enabled: !!shiftId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Session introuvable.
      </div>
    );
  }

  const variance = parseFloat(shift.variance ?? '0');
  const varianceColor = variance < 0 ? 'text-red-600' : variance > 0 ? 'text-blue-600' : 'text-emerald-600';
  const varianceLabel = variance < 0 ? 'Deficit' : variance > 0 ? 'Excedent' : 'Equilibre';

  const openedAt = new Date(shift.opened_at);
  const closedAt = shift.closed_at ? new Date(shift.closed_at) : null;
  const durationMs = closedAt ? closedAt.getTime() - openedAt.getTime() : 0;
  const durationH = Math.floor(durationMs / 3_600_000);
  const durationM = Math.floor((durationMs % 3_600_000) / 60_000);

  const totals = shift.totals;
  const totalCollected =
    parseFloat(totals.total_cash_payments) +
    parseFloat(totals.total_mobile_payments) +
    parseFloat(totals.total_bank_payments) +
    parseFloat(totals.total_credit_payments);

  const sales: Sale[] = shiftSales?.results ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cashier" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Detail de la session</h1>
          {shift.cashier_name && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Caissier : {shift.cashier_name}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timing */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Horaires</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Ouverture</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{openedAt.toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Fermeture</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {closedAt ? closedAt.toLocaleString('fr-FR') : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Duree</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{durationH}h {durationM}min</span>
            </div>
          </div>
        </div>

        {/* Cash summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Banknote size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Caisse</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Fond de caisse</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(shift.opening_float)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Attendu en caisse</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(shift.expected_cash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Compte en caisse</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {shift.closing_cash ? formatCurrency(shift.closing_cash) : '—'}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
              <span className="text-gray-700 dark:text-gray-300 font-medium">Ecart ({varianceLabel})</span>
              <span className={`font-bold ${varianceColor}`}>
                {variance > 0 ? '+' : ''}{formatCurrency(shift.variance ?? '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Payment methods breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Encaissements par mode</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Banknote size={14} /> Especes
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(totals.total_cash_payments)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Smartphone size={14} /> Mobile Money
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(totals.total_mobile_payments)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <CreditCard size={14} /> Virement / Banque
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(totals.total_bank_payments)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <FileText size={14} /> Credit
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(totals.total_credit_payments)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
              <span className="text-gray-700 dark:text-gray-300 font-medium">Total encaisse</span>
              <span className="text-gray-900 dark:text-gray-100 font-bold">{formatCurrency(totalCollected.toFixed(2))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Ventes totales</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(totals.total_sales)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {shift.notes && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-gray-500 dark:text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notes de cloture</h2>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{shift.notes}</p>
          </div>
        )}
      </div>

      {/* Sales processed during this shift */}
      {sales.length > 0 && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Ventes encaissees ({sales.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                  <th className="py-2 pr-3 font-medium">Facture</th>
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Vendeur</th>
                  <th className="py-2 pr-3 font-medium text-right">Total</th>
                  <th className="py-2 pr-3 font-medium text-right">Paye</th>
                  <th className="py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100">
                      {sale.invoice_number || '—'}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{sale.customer_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{sale.seller_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(sale.total)}</td>
                    <td className="py-2 pr-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(sale.amount_paid)}</td>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        sale.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : sale.status === 'PARTIALLY_PAID'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {sale.status === 'PAID' ? 'Payee' : sale.status === 'PARTIALLY_PAID' ? 'Partiel' : sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
