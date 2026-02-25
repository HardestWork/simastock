/** Reusable status badge component with color coding. */
import type { SaleStatus, ShiftStatus, AlertSeverity, TransferStatus, CountStatus, QuoteStatus } from '@/api/types';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'secondary';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  secondary: 'bg-gray-100 text-gray-800',
};

const saleStatusMap: Record<SaleStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Brouillon', variant: 'secondary' },
  PENDING_PAYMENT: { label: 'En attente', variant: 'warning' },
  PARTIALLY_PAID: { label: 'Paiement partiel', variant: 'info' },
  PAID: { label: 'Payee', variant: 'success' },
  CANCELLED: { label: 'Annulee', variant: 'danger' },
  REFUNDED: { label: 'Remboursee', variant: 'secondary' },
};

const shiftStatusMap: Record<ShiftStatus, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: 'Ouverte', variant: 'success' },
  CLOSED: { label: 'Fermee', variant: 'secondary' },
};

const severityMap: Record<AlertSeverity, { label: string; variant: BadgeVariant }> = {
  LOW: { label: 'Basse', variant: 'info' },
  MEDIUM: { label: 'Moyenne', variant: 'warning' },
  HIGH: { label: 'Haute', variant: 'danger' },
  CRITICAL: { label: 'Critique', variant: 'danger' },
};

const transferStatusMap: Record<TransferStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'En attente', variant: 'warning' },
  APPROVED: { label: 'Approuve', variant: 'info' },
  IN_TRANSIT: { label: 'En transit', variant: 'info' },
  RECEIVED: { label: 'Recu', variant: 'success' },
  CANCELLED: { label: 'Annule', variant: 'danger' },
};

const countStatusMap: Record<CountStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Brouillon', variant: 'secondary' },
  IN_PROGRESS: { label: 'En cours', variant: 'warning' },
  COMPLETED: { label: 'Termine', variant: 'success' },
  CANCELLED: { label: 'Annule', variant: 'danger' },
};

const quoteStatusMap: Record<QuoteStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Brouillon', variant: 'secondary' },
  SENT: { label: 'Envoye', variant: 'info' },
  ACCEPTED: { label: 'Accepte', variant: 'success' },
  REFUSED: { label: 'Refuse', variant: 'danger' },
  EXPIRED: { label: 'Expire', variant: 'warning' },
  CONVERTED: { label: 'Converti', variant: 'success' },
};

interface StatusBadgeProps {
  type: 'sale' | 'shift' | 'severity' | 'transfer' | 'count' | 'quote';
  value: string;
}

export default function StatusBadge({ type, value }: StatusBadgeProps) {
  let label: string;
  let variant: BadgeVariant;

  if (type === 'sale' && value in saleStatusMap) {
    ({ label, variant } = saleStatusMap[value as SaleStatus]);
  } else if (type === 'shift' && value in shiftStatusMap) {
    ({ label, variant } = shiftStatusMap[value as ShiftStatus]);
  } else if (type === 'severity' && value in severityMap) {
    ({ label, variant } = severityMap[value as AlertSeverity]);
  } else if (type === 'transfer' && value in transferStatusMap) {
    ({ label, variant } = transferStatusMap[value as TransferStatus]);
  } else if (type === 'count' && value in countStatusMap) {
    ({ label, variant } = countStatusMap[value as CountStatus]);
  } else if (type === 'quote' && value in quoteStatusMap) {
    ({ label, variant } = quoteStatusMap[value as QuoteStatus]);
  } else {
    label = value;
    variant = 'secondary';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]}`}
    >
      {label}
    </span>
  );
}
