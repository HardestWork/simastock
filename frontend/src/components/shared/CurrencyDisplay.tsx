/** Renders a formatted FCFA currency amount. */
import { formatCurrency } from '@/lib/currency';

interface CurrencyDisplayProps {
  value: number | string;
  className?: string;
}

export default function CurrencyDisplay({ value, className }: CurrencyDisplayProps) {
  return <span className={className}>{formatCurrency(value)}</span>;
}
