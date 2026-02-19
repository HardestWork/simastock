/** Customer detail page — info, credit accounts, purchase history. */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customerApi, creditApi, saleApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import StatusBadge from '@/components/shared/StatusBadge';
import { ChevronLeft, Pencil } from 'lucide-react';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  // Customer info
  const {
    data: customer,
    isLoading: customerLoading,
    isError: customerError,
  } = useQuery({
    queryKey: queryKeys.customers.detail(id!),
    queryFn: () => customerApi.get(id!),
    enabled: !!id,
  });

  // Credit accounts
  const { data: creditData } = useQuery({
    queryKey: queryKeys.creditAccounts.list({ customer: id! }),
    queryFn: () => creditApi.accounts({ customer: id! }),
    enabled: !!id,
  });

  // Purchase history (10 most recent)
  const { data: salesData } = useQuery({
    queryKey: queryKeys.sales.list({ customer: id!, ordering: '-created_at', page_size: '10' }),
    queryFn: () => saleApi.list({ customer: id!, ordering: '-created_at', page_size: '10' }),
    enabled: !!id,
  });

  const creditAccounts = creditData?.results ?? [];
  const sales = salesData?.results ?? [];

  /** Determine health color for a credit account. */
  function getCreditHealthColor(balance: string, limit: string, available: string): string {
    const bal = parseFloat(balance) || 0;
    const lim = parseFloat(limit) || 0;
    const avail = parseFloat(available) || 0;

    if (lim > 0 && bal > lim) return 'bg-red-500';
    if (lim > 0 && avail < lim * 0.2) return 'bg-orange-500';
    return 'bg-green-500';
  }

  if (customerLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (customerError || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-500">Client introuvable ou une erreur s'est produite.</p>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Retour aux clients
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
      >
        <ChevronLeft size={16} />
        Retour
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{customer.full_name}</h1>
        <Link
          to={`/customers/${id}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Pencil size={16} />
          Modifier
        </Link>
      </div>

      {/* Info panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Informations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Telephone</span>
            <p className="font-medium mt-0.5">{customer.phone || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">E-mail</span>
            <p className="font-medium mt-0.5">{customer.email || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Adresse</span>
            <p className="font-medium mt-0.5">{customer.address || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Structure</span>
            <p className="font-medium mt-0.5">{customer.company || '—'}</p>
          </div>
        </div>
      </div>

      {/* Credit accounts */}
      {creditAccounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Comptes de credit
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-left">
                  <th className="pb-2 font-medium">Limite</th>
                  <th className="pb-2 font-medium text-right">Solde</th>
                  <th className="pb-2 font-medium text-right">Disponible</th>
                  <th className="pb-2 font-medium text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {creditAccounts.map((account) => {
                  const healthColor = getCreditHealthColor(
                    account.balance,
                    account.credit_limit,
                    account.available_credit,
                  );
                  return (
                    <tr key={account.id} className="border-b border-gray-50">
                      <td className="py-3 font-medium">{formatCurrency(account.credit_limit)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(account.balance)}</td>
                      <td className="py-3 text-right">{formatCurrency(account.available_credit)}</td>
                      <td className="py-3 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${healthColor}`} />
                          <span className="text-gray-600">
                            {account.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchase history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Historique des achats
        </h2>
        {sales.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Aucun achat enregistre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-left">
                  <th className="pb-2 font-medium">Facture</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{sale.invoice_number ?? '—'}</td>
                    <td className="py-3 text-gray-600">
                      {new Date(sale.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-right font-medium">{formatCurrency(sale.total)}</td>
                    <td className="py-3 text-center">
                      <StatusBadge type="sale" value={sale.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
