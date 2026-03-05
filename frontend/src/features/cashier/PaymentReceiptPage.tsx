/** Printable payment receipt page — A5 professional layout. */
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { saleApi, paymentApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { ChevronLeft, Printer, MessageCircle } from 'lucide-react';
import type { PaymentMethod } from '@/api/types';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';

const METHOD_LABELS: Record<PaymentMethod | string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
  CREDIT: 'Crédit',
  CHEQUE: 'Chèque',
};

function sanitizePrintTitle(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function fmt(date: Date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(date: Date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function PaymentReceiptPage() {
  const { saleId } = useParams<{ saleId: string }>();
  // searchParams kept for future URL-based template override
  const currentStore = useStoreStore((s) => s.currentStore);

  const { data: sale, isLoading: saleLoading, isError: saleError } = useQuery({
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
    ? new Date(payments.map((p) => new Date(p.created_at).getTime()).reduce((a, b) => (b > a ? b : a), 0))
    : null;

  useEffect(() => { toast.dismiss(); }, []);

  useEffect(() => {
    if (!saleId) return undefined;
    const prev = document.title;
    document.title = sanitizePrintTitle(`RECU-${sale?.invoice_number ?? saleId.toUpperCase()}`);
    return () => { document.title = prev; };
  }, [sale?.invoice_number, saleId]);

  // Open full A4 invoice (same as POS "Facture" button)
  const handlePrintInvoice = () => {
    if (!saleId) return;
    window.open(`/api/v1/sales/${saleId}/invoice/?kind=invoice`, '_blank', 'noopener,noreferrer');
  };


  const handlePrint80mm = () => {
    if (!saleId) return;
    window.open(`/api/v1/sales/${saleId}/receipt/?template=ticket`, '_blank', 'noopener,noreferrer');
  };

  const whatsappUrl = (() => {
    if (!sale?.verification_token) return null;
    const raw = sale.customer_phone ?? '';
    const digits = raw.replace(/\D/g, '');
    if (!digits || digits.length < 8) return null;
    if (/^(\d)\1+$/.test(digits)) return null;
    // Normalize to international format (Burkina 226)
    let phone = digits;
    if (digits.startsWith('226') && digits.length >= 11) phone = digits;
    else if (digits.length === 8) phone = `226${digits}`;
    else if (digits.length === 10 && digits.startsWith('00')) phone = `226${digits.slice(2)}`;

    const pdfUrl = `${window.location.origin}/api/v1/invoices/dl/${sale.verification_token}/`;
    const text = [
      `Bonjour ${sale.customer_name ?? 'cher client'},`,
      '',
      `Veuillez trouver ci-joint votre Facture *${sale.invoice_number ?? ''}*.`,
      `Montant: *${Number(sale.total).toLocaleString('fr-FR')} FCFA*`,
      '',
      `Telecharger la Facture: ${pdfUrl}`,
      '',
      'Merci pour votre confiance !',
    ].join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  })();

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
        <p className="text-gray-500 dark:text-gray-400">Reçu introuvable ou une erreur s'est produite.</p>
        <Link to="/cashier" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} /> Retour à la caisse
        </Link>
      </div>
    );
  }

  const isPaid = parseFloat(sale.amount_due) <= 0;
  const payDate = latestPaymentDate ?? new Date(sale.created_at);
  const saleDate = new Date(sale.created_at);

  return (
    <>
      {/* Print-only page size */}
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 10mm 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="max-w-2xl mx-auto py-4 px-4 print:hidden">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/cashier"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ChevronLeft size={16} /> Retour
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintInvoice}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              title="Imprimer la facture (format A4)"
            >
              <Printer size={15} /> Facture
            </button>
            <button
              onClick={handlePrint80mm}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
              title="Ticket imprimante thermique 80mm"
            >
              <Printer size={15} /> Ticket caisse
            </button>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                title="Envoyer la facture PDF sur WhatsApp"
              >
                <MessageCircle size={15} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Receipt document ── */}
      <div className="max-w-2xl mx-auto px-4 pb-8 print:max-w-none print:px-0 print:pb-0">
        <div className="bg-white dark:bg-white rounded-2xl overflow-hidden shadow-lg print:shadow-none print:rounded-none border border-gray-200 print:border-0">

          {/* ── Header band ── */}
          <div className="bg-primary px-7 py-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <img src="/logo-icon.png" alt="Logo" className="h-8 w-auto object-contain brightness-0 invert" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <span className="text-white font-bold text-lg tracking-wide">{currentStore?.name ?? 'SimaStock'}</span>
              </div>
              {currentStore?.address && (
                <p className="text-primary-100 text-xs opacity-80">{currentStore.address}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-white/60 text-[10px] uppercase tracking-widest mb-0.5">Document</p>
              <p className="text-white font-bold text-base">{sale.invoice_number ?? '—'}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isPaid ? 'bg-emerald-400 text-emerald-900' : 'bg-amber-400 text-amber-900'}`}>
                {isPaid ? 'Payé' : 'En attente'}
              </span>
            </div>
          </div>

          {/* ── Title strip ── */}
          <div className="bg-gray-50 border-b border-gray-200 px-7 py-2.5 flex items-center justify-between">
            <h1 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Reçu de paiement
            </h1>
            <p className="text-[11px] text-gray-400">
              {fmt(payDate)} à {fmtTime(payDate)}
            </p>
          </div>

          {/* ── Info grid ── */}
          <div className="grid grid-cols-2 gap-0 border-b border-gray-200">
            {/* Client */}
            <div className="px-7 py-4 border-r border-gray-200">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Client</p>
              <p className="text-sm font-semibold text-gray-800">{sale.customer_name || 'Client comptant'}</p>
            </div>
            {/* Vendeur */}
            <div className="px-7 py-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Vendeur</p>
              <p className="text-sm font-semibold text-gray-800">{sale.seller_name || '—'}</p>
            </div>
            {/* Date vente */}
            <div className="px-7 py-3 border-r border-t border-gray-200">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Date vente</p>
              <p className="text-xs text-gray-700">{fmt(saleDate)} {fmtTime(saleDate)}</p>
            </div>
            {/* Mode paiement */}
            <div className="px-7 py-3 border-t border-gray-200">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Mode paiement</p>
              <p className="text-xs text-gray-700">
                {payments.length > 0
                  ? [...new Set(payments.map((p) => METHOD_LABELS[p.method] ?? p.method))].join(', ')
                  : '—'}
              </p>
            </div>
          </div>

          {/* ── Items table ── */}
          <div className="px-7 pt-5 pb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 pr-3">Désignation</th>
                  <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-12">Qté</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-28">P.U.</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="py-2 pr-3 text-gray-800 font-medium">{item.product_name}</td>
                    <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">{formatCurrency(item.line_total)}</td>
                  </tr>
                ))}
                {sale.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400 text-xs">Aucun article.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Totals ── */}
          <div className="px-7 pb-5 flex justify-end">
            <div className="w-64">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-100">
                  <div className="flex justify-between px-4 py-2 text-sm">
                    <span className="text-gray-500">Sous-total</span>
                    <span className="font-medium text-gray-800">{formatCurrency(sale.subtotal)}</span>
                  </div>
                  {parseFloat(sale.discount_amount) > 0 && (
                    <div className="flex justify-between px-4 py-2 text-sm">
                      <span className="text-orange-600">Remise</span>
                      <span className="text-orange-600 font-medium">−{formatCurrency(sale.discount_amount)}</span>
                    </div>
                  )}
                  {parseFloat(sale.tax_amount) > 0 && (
                    <div className="flex justify-between px-4 py-2 text-sm">
                      <span className="text-gray-500">Taxes</span>
                      <span className="text-gray-800">{formatCurrency(sale.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3 bg-primary">
                    <span className="font-bold text-white text-sm uppercase tracking-wide">Total</span>
                    <span className="font-bold text-white text-base">{formatCurrency(sale.total)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 text-sm">
                    <span className="text-emerald-700 font-medium">Payé</span>
                    <span className="text-emerald-700 font-semibold">{formatCurrency(sale.amount_paid)}</span>
                  </div>
                  {parseFloat(sale.amount_due) > 0 && (
                    <div className="flex justify-between px-4 py-2 text-sm bg-red-50">
                      <span className="text-red-600 font-bold">Reste dû</span>
                      <span className="text-red-600 font-bold">{formatCurrency(sale.amount_due)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Payments detail ── */}
          {payments.length > 0 && (
            <div className="px-7 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Détail paiements</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Mode</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-semibold">Montant</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold hidden sm:table-cell">Réf.</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold hidden sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-gray-700 font-medium">{METHOD_LABELS[p.method] ?? p.method}</td>
                        <td className="px-3 py-2 text-right text-gray-800 font-semibold">{formatCurrency(p.amount)}</td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{p.reference || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                          {fmt(new Date(p.created_at))} {fmtTime(new Date(p.created_at))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="border-t border-gray-200 px-7 py-5 flex items-end justify-between gap-4">
            {sale.verification_token ? (
              <div className="flex items-center gap-3">
                <QRCodeSVG
                  value={`${window.location.origin}/verify/${sale.verification_token}`}
                  size={52}
                  level="M"
                />
                <div className="text-[9px] text-gray-400 leading-tight">
                  <p className="font-semibold text-gray-500 mb-0.5">Vérifier ce document</p>
                  <p className="font-mono break-all max-w-[160px]">
                    {window.location.origin}/verify/{sale.verification_token}
                  </p>
                </div>
              </div>
            ) : <div />}
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-700 italic">Merci pour votre confiance !</p>
              <p className="text-[10px] text-gray-400 mt-0.5">© {new Date().getFullYear()} {currentStore?.name ?? 'SimaStock'}</p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
