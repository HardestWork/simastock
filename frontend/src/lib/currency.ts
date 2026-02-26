/** Format a number or string amount as FCFA currency. */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0 FCFA';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return '0 FCFA';
  return `${num.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}
