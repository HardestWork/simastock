/** Create a goods receipt from an existing purchase order. */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, Save, Check } from 'lucide-react';
import { purchaseOrderApi, goodsReceiptApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';
import type { GoodsReceiptCreatePayload, PurchaseOrderLine } from '@/api/types';

export default function GoodsReceiptCreatePage() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  // ── Fetch the purchase order ──────────────────────────────────────────
  const {
    data: po,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.purchaseOrders.detail(orderId!),
    queryFn: () => purchaseOrderApi.get(orderId!),
    enabled: !!orderId,
  });

  // Lines that still have quantities to receive
  const remainingLines: PurchaseOrderLine[] =
    po?.lines.filter((l) => l.remaining_qty > 0) ?? [];

  // Initialize receive quantities when PO data arrives
  useEffect(() => {
    if (!po) return;
    const initial: Record<string, number> = {};
    for (const line of po.lines) {
      if (line.remaining_qty > 0) {
        initial[line.id] = line.remaining_qty;
      }
    }
    setReceiveQtys(initial);
  }, [po]);

  // ── Create mutation ───────────────────────────────────────────────────
  const { mutate: createReceipt, isPending } = useMutation({
    mutationFn: (data: GoodsReceiptCreatePayload) => goodsReceiptApi.create(data),
    onSuccess: () => {
      toast.success('Reception enregistree avec succes');
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(orderId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
      navigate(`/purchases/orders/${orderId}`);
    },
    onError: (err: unknown) => {
      const message =
        (err as any)?.response?.data?.detail ||
        (err as any)?.response?.data?.non_field_errors?.[0] ||
        'Une erreur est survenue lors de la creation de la reception.';
      toast.error(message);
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────
  function updateQty(lineId: string, value: number, max: number) {
    setReceiveQtys((prev) => ({
      ...prev,
      [lineId]: Math.max(0, Math.min(value, max)),
    }));
  }

  function receiveAll() {
    const all: Record<string, number> = {};
    for (const line of remainingLines) {
      all[line.id] = line.remaining_qty;
    }
    setReceiveQtys(all);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!currentStore) {
      toast.error('Aucun magasin selectionne.');
      return;
    }

    // Build lines where quantity > 0
    const lines = remainingLines
      .filter((l) => (receiveQtys[l.id] ?? 0) > 0)
      .map((l) => ({
        purchase_order_line_id: l.id,
        quantity_received: receiveQtys[l.id],
      }));

    if (lines.length === 0) {
      toast.error('Veuillez saisir au moins une quantite a recevoir.');
      return;
    }

    createReceipt({
      store: currentStore.id,
      purchase_order: orderId!,
      notes: notes || undefined,
      lines,
    });
  }

  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (isError || !po) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          to="/purchases/orders"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ArrowLeft size={14} />
          Retour aux bons de commande
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 text-sm">
          Impossible de charger le bon de commande.
        </div>
      </div>
    );
  }

  // ── All lines fully received ──────────────────────────────────────────
  if (remainingLines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          to={`/purchases/orders/${orderId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ArrowLeft size={14} />
          Retour au bon de commande
        </Link>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <PackageCheck size={40} className="mx-auto mb-3 text-green-500 dark:text-green-400" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Toutes les lignes ont ete entierement recues.
          </p>
          <Link
            to={`/purchases/orders/${orderId}`}
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:text-primary/80 font-medium"
          >
            <ArrowLeft size={14} />
            Retour au bon de commande {po.po_number}
          </Link>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/purchases/orders/${orderId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
        >
          <ArrowLeft size={14} />
          Retour au bon de commande
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <PackageCheck size={24} className="text-primary" />
          Reception pour {po.po_number}
        </h1>
      </div>

      {/* PO info card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Informations du bon de commande</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Fournisseur</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">{po.supplier_name}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">N° commande</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">{po.po_number}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Statut</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">{po.status}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Lines table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Lignes a recevoir</h2>
            <button
              type="button"
              onClick={receiveAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Check size={15} />
              Tout recevoir
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Produit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Qte commandee</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Deja recu</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Restant</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Cout unitaire</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Qte a recevoir</th>
                </tr>
              </thead>
              <tbody>
                {remainingLines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{line.product_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{line.product_sku}</div>
                    </td>
                    {/* Qte commandee */}
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {line.quantity_ordered}
                    </td>
                    {/* Deja recu */}
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {line.quantity_received}
                    </td>
                    {/* Restant */}
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                      {line.remaining_qty}
                    </td>
                    {/* Cout unitaire */}
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(line.unit_cost)}
                    </td>
                    {/* Qte a recevoir */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={line.remaining_qty}
                        value={receiveQtys[line.id] ?? 0}
                        onChange={(e) =>
                          updateQty(line.id, parseInt(e.target.value, 10) || 0, line.remaining_qty)
                        }
                        className="w-24 mx-auto block px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes <span className="text-gray-400 dark:text-gray-500">(optionnel)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes sur cette reception..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link
            to={`/purchases/orders/${orderId}`}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save size={16} />
                Enregistrer la reception
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
