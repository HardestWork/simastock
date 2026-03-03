/** Debt aging report — client receivables and supplier payables. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { creditApi, purchaseOrderApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import Pagination from '@/components/shared/Pagination';
import { CreditCard, Users, Truck } from 'lucide-react';
import type { CustomerAccount, PurchaseOrder } from '@/api/types';

const PAGE_SIZE = 25;

type Tab = 'clients' | 'fournisseurs';

export default function DebtAgingPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [tab, setTab] = useState<Tab>('clients');
  const [clientPage, setClientPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);

  // --- Client receivables ---
  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ['debt-clients', currentStore?.id, clientPage],
    queryFn: () =>
      creditApi.accounts({
        store: currentStore!.id,
        page: String(clientPage),
        page_size: String(PAGE_SIZE),
        ordering: '-balance',
      }),
    enabled: !!currentStore && tab === 'clients',
  });

  const clientAccounts: CustomerAccount[] = (clientData?.results ?? []).filter(
    (acc) => parseFloat(acc.balance) > 0,
  );
  const clientTotal = clientAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
  const clientPages = clientData ? Math.ceil(clientData.count / PAGE_SIZE) : 0;

  // --- Supplier payables ---
  const { data: supplierData, isLoading: supplierLoading } = useQuery({
    queryKey: ['debt-suppliers', currentStore?.id, supplierPage],
    queryFn: () =>
      purchaseOrderApi.list({
        store: currentStore!.id,
        page: String(supplierPage),
        page_size: String(PAGE_SIZE),
        ordering: '-created_at',
      }),
    enabled: !!currentStore && tab === 'fournisseurs',
  });

  const pendingOrders: PurchaseOrder[] = (supplierData?.results ?? []).filter(
    (po) => po.status === 'SUBMITTED' || po.status === 'PARTIALLY_RECEIVED',
  );
  const supplierTotal = pendingOrders.reduce((sum, po) => sum + parseFloat(po.subtotal), 0);
  const supplierPages = supplierData ? Math.ceil(supplierData.count / PAGE_SIZE) : 0;

  const STATUS_BADGE: Record<string, string> = {
    SUBMITTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    PARTIALLY_RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    RECEIVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const STATUS_LABELS: Record<string, string> = {
    SUBMITTED: 'En attente',
    PARTIALLY_RECEIVED: 'Partiel',
    DRAFT: 'Brouillon',
    RECEIVED: 'Recu',
    CANCELLED: 'Annule',
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <CreditCard size={22} className="text-primary" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Créances & Dettes</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {([['clients', 'Créances clients', Users], ['fournisseurs', 'Dettes fournisseurs', Truck]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ),
        )}
      </div>

      {/* Client tab */}
      {tab === 'clients' && (
        <>
          {clientTotal > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700 dark:text-red-400">Total créances clients</span>
                <span className="text-xl font-bold text-red-700 dark:text-red-400">{formatCurrency(clientTotal)}</span>
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {clientLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Téléphone</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Solde dû</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Limite crédit</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {clientAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        Aucune creance client.
                      </td>
                    </tr>
                  ) : (
                    clientAccounts.map((acc) => (
                      <tr key={acc.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {acc.customer_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{acc.customer_phone || '—'}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(acc.balance)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {formatCurrency(acc.credit_limit)}
                        </td>
                        <td className={`px-4 py-3 text-right ${parseFloat(acc.available_credit) < 0 ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`}>
                          {formatCurrency(acc.available_credit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={clientPage} totalPages={clientPages} onPageChange={setClientPage} />
        </>
      )}

      {/* Supplier tab */}
      {tab === 'fournisseurs' && (
        <>
          {supplierTotal > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Total dettes fournisseurs</span>
                <span className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(supplierTotal)}</span>
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {supplierLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">N° BdC</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Fournisseur</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        Aucune dette fournisseur en attente.
                      </td>
                    </tr>
                  ) : (
                    pendingOrders.map((po) => (
                      <tr key={po.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                          <Link to={`/purchases/orders`} className="hover:text-primary hover:underline">
                            {po.po_number || '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{po.supplier_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[po.status] ?? ''}`}>
                            {STATUS_LABELS[po.status] ?? po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-400">
                          {formatCurrency(po.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                          {new Date(po.created_at).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={supplierPage} totalPages={supplierPages} onPageChange={setSupplierPage} />
        </>
      )}
    </div>
  );
}
