/** Detail view for a single stock transfer. */
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, ArrowLeftRight, CheckCircle, PackageCheck } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import type { TransferStatus } from '@/api/types';

const STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuve',
  IN_TRANSIT: 'En transit',
  RECEIVED: 'Recu',
  CANCELLED: 'Annule',
};

const STATUS_CLASSES: Record<TransferStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);
  const { user } = useAuthStore();

  const {
    data: transfer,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.transfers.detail(id!),
    queryFn: () => stockApi.getTransfer(id!),
    enabled: !!id,
  });

  const { mutate: approveTransfer, isPending: isApproving } = useMutation({
    mutationFn: () => stockApi.approveTransfer(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfers.detail(id!) });
    },
  });

  const { mutate: receiveTransfer, isPending: isReceiving } = useMutation({
    mutationFn: () => stockApi.receiveTransfer(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfers.detail(id!) });
    },
  });

  const canApprove =
    transfer?.status === 'PENDING' &&
    user?.role !== undefined &&
    ['MANAGER', 'ADMIN'].includes(user.role);

  const canReceive =
    transfer !== undefined &&
    ['APPROVED', 'IN_TRANSIT'].includes(transfer.status) &&
    currentStore?.id === transfer.to_store;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Impossible de charger le transfert.</p>
        <Link to="/stock/transfers" className="text-primary hover:underline text-sm mt-2 inline-block">
          Retour aux transferts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/stock/transfers"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            <ChevronLeft size={14} />
            Retour aux transferts
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight size={22} />
            Transfert #{transfer.id.substring(0, 8).toUpperCase()}
          </h1>
          <div className="mt-1">
            <StatusBadge status={transfer.status} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {canApprove && (
            <button
              onClick={() => approveTransfer()}
              disabled={isApproving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <CheckCircle size={16} />
              {isApproving ? 'Traitement...' : 'Approuver et traiter'}
            </button>
          )}
          {canReceive && (
            <button
              onClick={() => receiveTransfer()}
              disabled={isReceiving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PackageCheck size={16} />
              {isReceiving ? 'Traitement...' : 'Marquer comme recu'}
            </button>
          )}
        </div>
      </div>

      {/* Info panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Informations</h2>
        <div>
          <InfoRow label="Source" value={transfer.from_store_name} />
          <InfoRow label="Destination" value={transfer.to_store_name} />
          <InfoRow label="Statut" value={<StatusBadge status={transfer.status} />} />
          <InfoRow
            label="Cree le"
            value={format(new Date(transfer.created_at), 'dd/MM/yyyy HH:mm')}
          />
          <InfoRow label="Cree par" value={transfer.created_by_name ?? '-'} />
          <InfoRow label="Approuve par" value={transfer.approved_by_name ?? '-'} />
          {transfer.notes && (
            <InfoRow label="Notes" value={transfer.notes} />
          )}
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            Lignes de transfert ({transfer.lines.length})
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Produit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Quantite demandee</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Quantite recue</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((line) => (
              <tr key={line.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{line.product_name}</td>
                <td className="px-4 py-3 text-right text-gray-700">{line.quantity}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={
                      line.received_qty > 0 ? 'text-green-600 font-medium' : 'text-gray-400'
                    }
                  >
                    {line.received_qty > 0 ? line.received_qty : '-'}
                  </span>
                </td>
              </tr>
            ))}
            {transfer.lines.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  Aucune ligne de transfert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
