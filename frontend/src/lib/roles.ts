/** Role-based access helpers. */
import type { UserRole } from '@/api/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  SALES: 'Vendeur',
  CASHIER: 'Caissier',
  STOCKER: 'Magasinier',
};

/** Check if a role is at least manager level (MANAGER or ADMIN). */
export function isManagerOrAdmin(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
