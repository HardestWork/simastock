/** Detail view for a single purchase order (bon de commande). */
import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Pencil,
  Send,
  Trash2,
  XCircle,
  PackageCheck,
  FileText,
  Calendar,
  User,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { purchaseOrderApi, goodsReceiptApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import type { PurchaseOrderStatus } from '@/api/types';
import type { AxiosError } from 'axios';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const statusConfig: Record<PurchaseOrderStatus, { label: string; classes: string }> = {
  DRAFT: { label: 'Brouillon', classes: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  SUBMITTED: { label: 'Soumis', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PARTIALLY_RECEIVED: { label: 'Partiellement recu', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  RECEIVED: { label: 'Recu', classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  CANCELLED: { label: 'Annule', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function extractErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<{ detail?: string; non_field_errors?: string[] }>;
  return (
    axErr?.response?.data?.detail ??
    axErr?.response?.data?.non_field_errors?.[0] ??
    (err as Error)?.message ??
    'Une erreur est survenue.'
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  /* ---- Queries ----------------------------------------------------------- */

  const {
    data: po,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id!),
    queryFn: () => purchaseOrderApi.get(id!),
    enabled: !!id,
  });

  const receiptParams: Record<string, string> = { purchase_order: id! };

  const { data: receiptsData } = useQuery({
    queryKey: queryKeys.goodsReceipts.list(receiptParams),
    queryFn: () => goodsReceiptApi.list(receiptParams),
    enabled: !!id,
  });

  const receipts = receiptsData?.results ?? [];

  /* ---- Mutations --------------------------------------------------------- */

  const submitMut = useMutation({
    mutationFn: () => purchaseOrderApi.submit(id!),
    onSuccess: () => {
      toast.success(`Bon de commande ${po?.po_number ?? ''} soumis avec succes.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => purchaseOrderApi.cancel(id!, cancelReason || undefined),
    onSuccess: () => {
      toast.warning(`Bon de commande ${po?.po_number ?? ''} annule.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      setShowCancelModal(false);
      setCancelReason('');
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => purchaseOrderApi.delete(id!),
    onSuccess: () => {
      toast.warning(`Bon de commande ${po?.po_number ?? ''} supprime.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      setShowDeleteConfirm(false);
      navigate('/purchases/orders');
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err));
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

  if (isError || !po) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-800 dark:text-red-300 font-medium">
            Impossible de charger le bon de commande.
          </p>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">
            {(error as Error)?.message ?? 'Erreur inconnue.'}
          </p>
          <Link
            to="/purchases/orders"
            className="inline-block mt-4 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            Retour aux bons de commande
          </Link>
        </div>
      </div>
    );
  }

  /* ---- Derived values ---------------------------------------------------- */

  const anyMutating = submitMut.isPending || cancelMut.isPending || deleteMut.isPending;
  const statusCfg = statusConfig[po.status];

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* ---- Back link ---------------------------------------------------- */}
      <Link
        to="/purchases/orders"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux bons de commande
      </Link>

      {/* ---- Header ------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <FileText className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {po.po_number}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.classes}`}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* ---- Action buttons --------------------------------------------- */}
        <div className="flex gap-2 flex-wrap">
          {po.status === 'DRAFT' && (
            <>
              <Link
                to={`/purchases/orders/${id}/edit`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </Link>
              <button
                type="button"
                disabled={anyMutating}
                onClick={() => submitMut.mutate()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Soumettre
              </button>
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

          {po.status === 'SUBMITTED' && (
            <>
              <Link
                to={`/purchases/orders/${id}/receive`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <PackageCheck className="h-4 w-4" />
                Recevoir
              </Link>
              <button
                type="button"
                disabled={anyMutating}
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Annuler
              </button>
            </>
          )}

          {po.status === 'PARTIALLY_RECEIVED' && (
            <>
              <Link
                to={`/purchases/orders/${id}/receive`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <PackageCheck className="h-4 w-4" />
                Recevoir
              </Link>
              <button
                type="button"
                disabled={anyMutating}
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Annuler
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---- Info cards --------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <Building2 className="h-4 w-4" />
            Fournisseur
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {po.supplier_name}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <User className="h-4 w-4" />
            Cree par
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {po.created_by_name || '\u2014'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <Calendar className="h-4 w-4" />
            Date
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {format(new Date(po.created_at), 'dd MMMM yyyy, HH:mm', { locale: fr })}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <FileText className="h-4 w-4" />
            Total
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(po.subtotal)}
          </p>
        </div>
      </div>

      {/* ---- Lines table -------------------------------------------------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Lignes de commande
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Produit
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Qte commandee
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Qte recue
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Restant
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Cout unitaire
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Total ligne
                </th>
              </tr>
            </thead>
            <tbody>
              {po.lines.length > 0 ? (
                po.lines.map((line) => (
                  <tr
                    key={line.id}
                    className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                      line.remaining_qty > 0
                        ? 'bg-amber-50 dark:bg-amber-900/10'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {line.product_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {line.product_sku}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {line.quantity_ordered}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {line.quantity_received}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          line.remaining_qty > 0
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }
                      >
                        {line.remaining_qty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(line.unit_cost)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(line.line_total)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    Aucune ligne dans ce bon de commande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Notes section ------------------------------------------------ */}
      {po.notes && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Notes</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
            {po.notes}
          </p>
        </div>
      )}

      {/* ---- Goods Receipts section --------------------------------------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Receptions
          </h2>
        </div>
        {receipts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    N° reception
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    Lignes recues
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {receipt.receipt_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {format(new Date(receipt.created_at), 'dd MMMM yyyy, HH:mm', { locale: fr })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {receipt.lines.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
            Aucune reception enregistree.
          </div>
        )}
      </div>

      {/* ---- Cancel modal ------------------------------------------------- */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Annuler le bon de commande
            </h2>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif de l'annulation (optionnel)"
              rows={4}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none mb-4 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
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
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {cancelMut.isPending ? 'Traitement...' : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Delete confirm dialog ---------------------------------------- */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Supprimer ce bon de commande ?"
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
