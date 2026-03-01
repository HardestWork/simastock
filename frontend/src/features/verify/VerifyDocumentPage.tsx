/** Public document verification page — no login required. */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { documentApi } from '@/api/endpoints';
import { CheckCircle, XCircle, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Facture',
  QUOTE: 'Devis',
  CREDIT_PAYMENT: 'Recu de remboursement credit',
  STOCK_MOVEMENT: 'Bon de stock',
};

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Paye',
  PENDING: 'En attente',
  PARTIAL: 'Partiel',
  CANCELLED: 'Annule',
  DRAFT: 'Brouillon',
  ACCEPTED: 'Accepte',
  REJECTED: 'Rejete',
  EXPIRED: 'Expire',
  CONVERTED: 'Converti',
  IN: 'Entree',
  OUT: 'Sortie',
  ADJUST: 'Ajustement',
  TRANSFER: 'Transfert',
};

export default function VerifyDocumentPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document-verify', token],
    queryFn: () => documentApi.verify(token!),
    enabled: !!token,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-xl font-bold text-gray-800">
            <ShieldCheck className="text-blue-600" size={28} />
            SimaStock
          </div>
          <p className="text-sm text-gray-500 mt-1">Verification de document</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="animate-spin text-blue-600 mb-3" size={36} />
              <p className="text-gray-500">Verification en cours...</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <XCircle className="text-red-500 mb-3" size={48} />
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Document introuvable</h2>
              <p className="text-sm text-gray-500 text-center">
                Ce document n&apos;existe pas dans notre systeme ou le lien est invalide.
              </p>
            </div>
          )}

          {data && !data.found && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <XCircle className="text-red-500 mb-3" size={48} />
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Document introuvable</h2>
              <p className="text-sm text-gray-500 text-center">
                Aucun document ne correspond a ce code de verification.
              </p>
            </div>
          )}

          {data && data.found && (
            <>
              {/* Success banner */}
              <div className="bg-green-50 border-b border-green-100 px-6 py-4 flex items-center gap-3">
                <CheckCircle className="text-green-600 shrink-0" size={24} />
                <div>
                  <p className="text-sm font-semibold text-green-800">Document authentique</p>
                  <p className="text-xs text-green-600">Ce document a ete verifie avec succes.</p>
                </div>
              </div>

              {/* Document details */}
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="text-blue-600" size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">
                      {DOC_TYPE_LABELS[data.document_type] || data.document_type}
                    </p>
                    <p className="font-semibold text-gray-800">{data.number}</p>
                  </div>
                </div>

                <Row label="Date" value={formatDate(data.date)} />
                {data.total && <Row label="Montant" value={formatCurrency(Number(data.total))} />}
                <Row label="Statut" value={STATUS_LABELS[data.status] || data.status} />
                {data.customer && <Row label="Client" value={data.customer} />}
                <Row label="Entreprise" value={data.enterprise} />
                <Row label="Boutique" value={data.store} />
                {data.hash && <Row label="Code d'authenticite" value={data.hash} mono />}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          SimaStock &mdash; Systeme de gestion de boutique
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-800 ${mono ? 'font-mono text-xs bg-gray-50 px-2 py-0.5 rounded' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
