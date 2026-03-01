/** Detail view for a single quote (devis). */
import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ChevronLeft,
  FileText,
  Send,
  XCircle,
  ArrowRightLeft,
  Copy,
  Pencil,
  Trash2,
  Download,
  AlertCircle,
  X,
} from 'lucide-react';
import { quoteApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/auth/auth-store';
import StatusBadge from '@/components/shared/StatusBadge';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from '@/lib/toast';
import { extractApiError as extractErrorMessage } from '@/lib/api-error';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [actionError, setActionError] = useState<string | null>(null);
  const [refuseReason, setRefuseReason] = useState('');
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  /* ---- Permission checks ------------------------------------------------- */

  const isManagerOrAdmin = user?.role && ['MANAGER', 'ADMIN'].includes(user.role);

  /* ---- Query ------------------------------------------------------------- */

  const {
    data: quote,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.quotes.detail(id!),
    queryFn: () => quoteApi.get(id!),
    enabled: !!id,
  });

  /* ---- Mutations --------------------------------------------------------- */

  const sendMut = useMutation({
    mutationFn: () => quoteApi.send(id!),
    onSuccess: () => {
      toast.info(`Devis envoye: ${quote?.quote_number ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const refuseMut = useMutation({
    mutationFn: () => quoteApi.refuse(id!, refuseReason),
    onSuccess: () => {
      toast.warning(`Devis refuse: ${quote?.quote_number ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      setShowRefuseModal(false);
      setRefuseReason('');
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const convertMut = useMutation({
    mutationFn: () => quoteApi.convert(id!),
    onSuccess: (sale) => {
      toast.success(`Devis converti en facture: ${quote?.quote_number ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      navigate(`/cashier/payment/${sale.id}`);
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const duplicateMut = useMutation({
    mutationFn: () => quoteApi.duplicate(id!),
    onSuccess: (newQuote: { id: string }) => {
      toast.info(`Copie du devis creee depuis ${quote?.quote_number ?? 'ce devis'}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      navigate(`/quotes/${newQuote.id}`);
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => quoteApi.delete(id!),
    onSuccess: () => {
      toast.warning(`Devis supprime: ${quote?.quote_number ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      setShowDeleteConfirm(false);
      navigate('/quotes');
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => quoteApi.cancel(id!, cancelReason),
    onSuccess: () => {
      toast.warning(`Devis annule: ${quote?.quote_number ?? 'sans numero'}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      setShowCancelModal(false);
      setCancelReason('');
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
      setActionError(extractErrorMessage(err));
    },
  });

  /* ---- Loading / error states -------------------------------------------- */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-800 font-medium">Impossible de charger le devis.</p>
          <p className="text-red-600 text-sm mt-1">
            {(error as Error)?.message ?? 'Erreur inconnue.'}
          </p>
          <Link
            to="/quotes"
            className="inline-block mt-4 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Retour aux devis
          </Link>
        </div>
      </div>
    );
  }

  /* ---- Derived values ---------------------------------------------------- */

  const anyMutating =
    sendMut.isPending ||
    refuseMut.isPending ||
    convertMut.isPending ||
    duplicateMut.isPending ||
    deleteMut.isPending ||
    cancelMut.isPending;

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* ---- Header ------------------------------------------------------ */}
      <div className="mb-6">
        <Link
          to="/quotes"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour aux devis
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <FileText className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {quote.document_type === 'PROFORMA' ? 'Proforma' : 'Devis'} {quote.quote_number || `#${quote.id.substring(0, 8).toUpperCase()}`}
          </h1>
          <StatusBadge type="quote" value={quote.status} />
          {quote.is_expired && quote.status === 'SENT' && (
            <span className="text-xs text-red-600 font-medium">Ce devis a expirÃ©</span>
          )}
        </div>
      </div>

      {/* ---- Error banner ------------------------------------------------ */}
      {actionError && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-800 flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ---- Action buttons ---------------------------------------------- */}
      <div className="flex gap-2 flex-wrap justify-end mb-6">
        {quote.status === 'DRAFT' && (
          <>
            <Link
              to={`/quotes/${id}/edit`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Pencil className="h-4 w-4" />
              Modifier
            </Link>
            <button
              type="button"
              disabled={anyMutating}
              onClick={() => sendMut.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Envoyer
            </button>
            <button
              type="button"
              disabled={anyMutating}
              onClick={() => duplicateMut.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Dupliquer
            </button>
            {isManagerOrAdmin && (
              <button
                type="button"
                disabled={anyMutating}
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-400 text-sm font-medium hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Annuler
              </button>
            )}
            <button
              type="button"
              disabled={anyMutating}
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
          </>
        )}

        {(quote.status === 'SENT' || quote.status === 'ACCEPTED') && (
          <>
            {isManagerOrAdmin && (
              <>
                <button
                  type="button"
                  disabled={anyMutating}
                  onClick={() => convertMut.mutate()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Convertir en facture
                </button>
                <button
                  type="button"
                  disabled={anyMutating}
                  onClick={() => setShowRefuseModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Refuser
                </button>
                <button
                  type="button"
                  disabled={anyMutating}
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-400 text-sm font-medium hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Annuler
                </button>
              </>
            )}
            <button
              type="button"
              disabled={anyMutating}
              onClick={() => duplicateMut.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Dupliquer
            </button>
            <a
              href={`/api/v1/quotes/${id}/pdf/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Download className="h-4 w-4" />
              PDF
            </a>
          </>
        )}

        {quote.status === 'REFUSED' && (
          <button
            type="button"
            disabled={anyMutating}
            onClick={() => duplicateMut.mutate()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            Dupliquer
          </button>
        )}

        {quote.status === 'EXPIRED' && (
          <button
            type="button"
            disabled={anyMutating}
            onClick={() => duplicateMut.mutate()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            Dupliquer
          </button>
        )}

        {quote.status === 'CONVERTED' && (
          <>
            {quote.converted_sale_id && (
              <Link
                to={`/cashier/payment/${quote.converted_sale_id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <FileText className="h-4 w-4" />
                Voir la facture
              </Link>
            )}
            <button
              type="button"
              disabled={anyMutating}
              onClick={() => duplicateMut.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Dupliquer
            </button>
            <a
              href={`/api/v1/quotes/${id}/pdf/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Download className="h-4 w-4" />
              PDF
            </a>
          </>
        )}
      </div>

      {/* ---- Info panel --------------------------------------------------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <InfoRow label="Client" value={quote.customer_name || 'â€”'} />
        <InfoRow label="CrÃ©Ã© par" value={quote.created_by_name || 'â€”'} />
        <InfoRow
          label="Date crÃ©ation"
          value={format(new Date(quote.created_at), 'dd/MM/yyyy HH:mm')}
        />
        <InfoRow
          label="ValiditÃ©"
          value={
            quote.valid_until ? (
              <span className={quote.is_expired ? 'text-red-600' : undefined}>
                {format(new Date(quote.valid_until), 'dd/MM/yyyy')}
              </span>
            ) : (
              'â€”'
            )
          }
        />
        <InfoRow label="Type" value={quote.document_type === 'PROFORMA' ? 'Facture proforma' : 'Devis'} />
        <InfoRow label="Statut" value={<StatusBadge type="quote" value={quote.status} />} />
        {quote.sent_at && (
          <InfoRow
            label="EnvoyÃ© le"
            value={format(new Date(quote.sent_at), 'dd/MM/yyyy HH:mm')}
          />
        )}
        {quote.accepted_at && (
          <InfoRow
            label="AcceptÃ© le"
            value={format(new Date(quote.accepted_at), 'dd/MM/yyyy HH:mm')}
          />
        )}
        {quote.refused_at && (
          <InfoRow
            label="RefusÃ© le"
            value={format(new Date(quote.refused_at), 'dd/MM/yyyy HH:mm')}
          />
        )}
        {quote.refusal_reason && (
          <InfoRow label="Motif refus" value={quote.refusal_reason} />
        )}
        {quote.cancelled_at && (
          <InfoRow
            label="Annule le"
            value={format(new Date(quote.cancelled_at), 'dd/MM/yyyy HH:mm')}
          />
        )}
        {quote.cancellation_reason && (
          <InfoRow label="Motif annulation" value={quote.cancellation_reason} />
        )}
        {quote.converted_at && (
          <InfoRow
            label="Converti le"
            value={format(new Date(quote.converted_at), 'dd/MM/yyyy HH:mm')}
          />
        )}
        {quote.converted_sale_invoice && (
          <InfoRow
            label="Facture"
            value={
              <Link
                to={`/cashier/payment/${quote.converted_sale_id}`}
                className="text-blue-600 hover:underline"
              >
                {quote.converted_sale_invoice}
              </Link>
            }
          />
        )}
        {quote.notes && <InfoRow label="Notes" value={quote.notes} />}
        {quote.conditions && <InfoRow label="Conditions" value={quote.conditions} />}
      </div>

      {/* ---- Items table ------------------------------------------------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Produit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Prix unitaire</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">QuantitÃ©</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Remise</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Total ligne</th>
            </tr>
          </thead>
          <tbody>
            {quote.items && quote.items.length > 0 ? (
              quote.items.map(
                (item, idx) => (
                  <tr key={item.id ?? idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.product_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(item.discount_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(item.line_total)}
                    </td>
                  </tr>
                ),
              )
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  Aucun article dans ce devis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Totals section ---------------------------------------------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-between py-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Sous-total</span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {formatCurrency(quote.subtotal)}
          </span>
        </div>
        {parseFloat(quote.discount_amount) > 0 && (
          <div className="flex justify-between py-2">
            <span className="text-sm text-red-600">
              Remise{parseFloat(quote.discount_percent) > 0 ? ` (${quote.discount_percent}%)` : ''}
            </span>
            <span className="text-sm font-medium text-red-600">
              -{formatCurrency(quote.discount_amount)}
            </span>
          </div>
        )}
        {parseFloat(quote.tax_amount) > 0 && (
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">TVA</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatCurrency(quote.tax_amount)}
            </span>
          </div>
        )}
        <div className="flex justify-between py-3 border-t border-gray-200 dark:border-gray-700 mt-2">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">Total</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(quote.total)}
          </span>
        </div>
      </div>

      {/* ---- Refuse modal ------------------------------------------------ */}
      {showRefuseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Refuser le devis</h2>
            <textarea
              value={refuseReason}
              onChange={(e) => setRefuseReason(e.target.value)}
              placeholder="Motif du refus (optionnel)"
              rows={4}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none mb-4 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowRefuseModal(false);
                  setRefuseReason('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={refuseMut.isPending}
                onClick={() => refuseMut.mutate()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Cancel modal ------------------------------------------------ */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Annuler le devis</h2>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Raison de l'annulation (optionnel)"
              rows={4}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none mb-4 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                Fermer
              </button>
              <button
                type="button"
                disabled={cancelMut.isPending}
                onClick={() => cancelMut.mutate()}
                className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-60"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Supprimer ce devis ?"
        message="Cette action est irreversible et supprimera definitivement ce document."
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMut.isPending}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}

