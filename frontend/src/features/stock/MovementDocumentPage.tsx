/** Printable movement batch document page. */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import type { MovementType } from '@/api/types';

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  IN: 'Entree',
  OUT: 'Sortie',
  ADJUST: 'Ajustement',
  DAMAGE: 'Dommage',
  TRANSFER_IN: 'Transfert entrant',
  TRANSFER_OUT: 'Transfert sortant',
  RETURN: 'Retour',
  SALE: 'Vente',
  PURCHASE: 'Achat',
};

const MOVEMENT_TYPE_COLORS: Record<MovementType, string> = {
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-red-100 text-red-700',
  ADJUST: 'bg-blue-100 text-blue-700',
  DAMAGE: 'bg-orange-100 text-orange-700',
  TRANSFER_IN: 'bg-purple-100 text-purple-700',
  TRANSFER_OUT: 'bg-purple-100 text-purple-700',
  RETURN: 'bg-yellow-100 text-yellow-700',
  SALE: 'bg-red-100 text-red-700',
  PURCHASE: 'bg-green-100 text-green-700',
};

/** Returns true for movement types that increase stock (positive qty). */
function isPositiveMovement(type: MovementType): boolean {
  return ['IN', 'TRANSFER_IN', 'RETURN', 'PURCHASE', 'ADJUST'].includes(type);
}

export default function MovementDocumentPage() {
  const { batchId } = useParams<{ batchId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.stockMovements.document(batchId!),
    queryFn: () => stockApi.movementDocument(batchId!),
    enabled: !!batchId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-500">
          Document introuvable ou une erreur s'est produite.
        </p>
        <Link
          to="/stock/movements"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={15} />
          Retour aux mouvements
        </Link>
      </div>
    );
  }

  const dateFormatted = format(new Date(data.date), 'dd/MM/yyyy HH:mm');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Top navigation — hidden when printing */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          to="/stock/movements"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={15} />
          Mouvements
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Printer size={15} />
          Imprimer
        </button>
      </div>

      {/* Document card */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:p-0">
        {/* Document title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">
            {data.doc_type}
          </h1>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8 border border-gray-200 rounded-lg p-4 print:border-gray-300">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Magasin
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{data.store_name}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Date
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{dateFormatted}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Lot (Batch)
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5 font-mono">{data.batch_id}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Reference
            </span>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{data.reference || '—'}</p>
          </div>
          {data.reason && (
            <div className="col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Motif
              </span>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{data.reason}</p>
            </div>
          )}
        </div>

        {/* Movements table */}
        <div className="overflow-hidden border border-gray-200 rounded-lg print:border-gray-300 mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 print:bg-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Produit</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Quantite</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acteur</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((movement) => {
                const positive = isPositiveMovement(movement.movement_type);
                const qtyPrefix = positive ? '+' : '-';
                const absQty = Math.abs(movement.quantity);

                return (
                  <tr
                    key={movement.id}
                    className="border-b border-gray-50 hover:bg-gray-50 print:hover:bg-transparent"
                  >
                    {/* Product */}
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {movement.product_name}
                    </td>

                    {/* Quantity — color-coded */}
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        positive ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {qtyPrefix}{absQty}
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium print:bg-transparent print:text-gray-700 ${
                          MOVEMENT_TYPE_COLORS[movement.movement_type]
                        }`}
                      >
                        {MOVEMENT_TYPE_LABELS[movement.movement_type]}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3 text-gray-600">
                      {movement.actor_name || '—'}
                    </td>
                  </tr>
                );
              })}
              {data.movements.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Aucune ligne dans ce document.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="flex justify-end">
          <div className="border border-gray-200 rounded-lg p-4 min-w-[220px] print:border-gray-300">
            <div className="flex justify-between items-center gap-8 py-1 border-b border-gray-100 text-sm">
              <span className="text-gray-600">Nombre de lignes</span>
              <span className="font-semibold text-gray-800">{data.total_lines}</span>
            </div>
            <div className="flex justify-between items-center gap-8 py-1 text-sm">
              <span className="text-gray-600">Quantite totale</span>
              <span className="font-bold text-gray-900">{data.total_qty}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
