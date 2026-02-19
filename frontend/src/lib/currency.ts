/** Format a number or string amount as FCFA currency. */
export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 FCFA';
  return `${num.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}
