/** Sales refunds list page. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { refundApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import Pagination from '@/components/shared/Pagination';
import type { RefundMethod } from '@/api/types';

const PAGE_SIZE = 20;

const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CREDIT: 'Avoir',
};

const REFUND_METHOD_BADGE: Record<RefundMethod, string> = {
  CASH: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  MOBILE_MONEY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  BANK_TRANSFER: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CREDIT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function RefundListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);

  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState('');

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
    ordering: '-created_at',
  };
  if (methodFilter) params.refund_method = methodFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['refunds', currentStore?.id, page, methodFilter],
    queryFn: () => refundApi.list(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <RotateCcw size={22} className="text-primary" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Remboursements</h1>
        </div>
        {data && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {data.count} remboursement{data.count > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <select
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">Toutes les methodes</option>
          <option value="CASH">Especes</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
          <option value="BANK_TRANSFER">Virement bancaire</option>
          <option value="CREDIT">Avoir / Credit</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">N° Avoir</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Montant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Methode</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Raison</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Stock</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((refund) => (
                <tr key={refund.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(refund.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {refund.credit_note_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                    {refund.sale.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                    -{formatCurrency(refund.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${REFUND_METHOD_BADGE[refund.refund_method]}`}>
                      {REFUND_METHOD_LABELS[refund.refund_method]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={refund.reason}>
                    {refund.reason}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {refund.restore_stock ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Restaure
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun remboursement trouve.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
