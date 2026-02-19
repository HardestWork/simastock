/** Reports page — sales report with date range filter. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';

export default function ReportsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.salesReport(currentStore?.id ?? '', dateFrom, dateTo),
    queryFn: () =>
      reportApi.sales({
        store: currentStore!.id,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    enabled: !!currentStore,
  });

  if (!currentStore) {
    return <div className="text-center py-12 text-gray-500">Aucun magasin selectionne.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Rapports</h1>

      {/* Date filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date debut</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Chiffre d'affaires</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.total_revenue ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Commandes</p>
              <p className="text-2xl font-bold">{data.summary?.total_orders ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Panier moyen</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.average_order ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Encaisse</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.total_collected ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Remises</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.total_discounts ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Impaye</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.total_outstanding ?? 0)}</p>
            </div>
          </div>

          {/* Ventes par vendeur */}
          {data.by_seller && data.by_seller.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">Ventes par vendeur</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Vendeur</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Commandes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_seller.map((s: { seller: string; order_count: number; total_sales: string }, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{s.seller}</td>
                      <td className="px-4 py-3 text-right">{s.order_count}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.total_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ventes par categorie */}
          {data.by_category && data.by_category.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">Ventes par categorie</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Categorie</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Quantite</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_category.map((c: { category: string; total_quantity: number; total_revenue: string }, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{c.category ?? 'Sans categorie'}</td>
                      <td className="px-4 py-3 text-right">{c.total_quantity}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
