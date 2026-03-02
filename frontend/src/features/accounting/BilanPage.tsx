/** Bilan comptable SYSCOHADA — etat du patrimoine a une date donnee. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import apiClient from '@/api/client';
import type { BilanData, FiscalYear, PaginatedResponse } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';

export default function BilanPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const [fiscalYearFilter, setFiscalYearFilter] = useState('');

  const { data: fiscalYearData } = useQuery({
    queryKey: ['accounting', 'fiscal-years', 'list-all'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<FiscalYear>>('accounting/fiscal-years/', {
        params: { page_size: '50' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (fiscalYearFilter) p.fiscal_year = fiscalYearFilter;
    return p;
  }, [fiscalYearFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'bilan', params],
    queryFn: async () => {
      const { data } = await apiClient.get<BilanData>('accounting/reports/bilan/', { params });
      return data;
    },
    enabled: !!currentStore,
  });

  const totals = data?.totals;
  const actifNet = parseFloat(totals?.total_actif_net ?? '0');
  const passifTotal = parseFloat(totals?.total_passif ?? '0');
  const isBalanced = Math.abs(actifNet - passifTotal) < 0.01;
  const hasData = data && (data.actif.some((s) => s.lines.length > 0) || data.passif.some((s) => s.lines.length > 0));

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Bilan</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Etat du patrimoine — actif et passif
        </p>
      </div>

      {/* Fiscal year selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
            Exercice fiscal :
          </label>
          <select
            value={fiscalYearFilter}
            onChange={(e) => setFiscalYearFilter(e.target.value)}
            className="w-full sm:w-auto sm:min-w-[250px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Exercice ouvert (par defaut)</option>
            {fiscalYearData?.results.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.status === 'OPEN' ? 'Ouvert' : 'Cloture'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {hasData && totals && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 text-center">
            <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Actif Net</div>
            <div className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totals.total_actif_net)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 text-center">
            <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Passif</div>
            <div className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totals.total_passif)}</div>
          </div>
          <div className={`rounded-xl border p-3 sm:p-4 text-center ${
            isBalanced
              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
          }`}>
            <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Equilibre</div>
            <div className={`flex items-center justify-center gap-1 mt-1 ${isBalanced ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {isBalanced
                ? <><CheckCircle size={14} /><span className="text-xs sm:text-sm font-bold">Equilibre</span></>
                : <><AlertTriangle size={14} /><span className="text-xs sm:text-sm font-bold">{formatCurrency(Math.abs(actifNet - passifTotal))}</span></>
              }
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      ) : !hasData ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          Aucune donnee disponible. Assurez-vous d'avoir un exercice ouvert avec des ecritures comptabilisees.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ACTIF */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-blue-600 px-4 py-3">
              <h2 className="text-base font-bold text-white uppercase tracking-wide">ACTIF</h2>
            </div>
            {/* Desktop table header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              <span>Compte</span>
              <span className="text-right w-20">Brut</span>
              <span className="text-right w-20">Amort.</span>
              <span className="text-right w-20">Net</span>
            </div>
            {data.actif.map((section) => (
              <div key={section.section}>
                {/* Section header */}
                <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">{section.section}</span>
                </div>
                {/* Lines */}
                {section.lines.map((line) => (
                  <div key={line.account_code} className="px-4 py-2 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    {/* Mobile */}
                    <div className="sm:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-gray-500">{line.account_code}</span>
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{line.account_name}</p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">{formatCurrency(line.net)}</span>
                      </div>
                    </div>
                    {/* Desktop */}
                    <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center">
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-gray-400 mr-2">{line.account_code}</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{line.account_name}</span>
                      </div>
                      <span className="text-sm text-right text-gray-700 dark:text-gray-300 w-20">{formatCurrency(line.brut)}</span>
                      <span className="text-sm text-right text-red-600 dark:text-red-400 w-20">
                        {parseFloat(line.amortissement || '0') > 0 ? formatCurrency(line.amortissement) : '-'}
                      </span>
                      <span className="text-sm font-semibold text-right text-gray-900 dark:text-gray-100 w-20">{formatCurrency(line.net)}</span>
                    </div>
                  </div>
                ))}
                {/* Section subtotal */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-4 py-2 bg-blue-50/50 dark:bg-blue-900/10 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Sous-total</span>
                  <span className="text-sm font-semibold text-right text-gray-700 dark:text-gray-300 w-20">
                    {section.subtotal_brut !== undefined ? formatCurrency(section.subtotal_brut) : ''}
                  </span>
                  <span className="text-sm font-semibold text-right text-red-600 dark:text-red-400 w-20">
                    {section.subtotal_amortissement !== undefined && parseFloat(section.subtotal_amortissement || '0') > 0
                      ? formatCurrency(section.subtotal_amortissement)
                      : '-'}
                  </span>
                  <span className="text-sm font-bold text-right text-blue-700 dark:text-blue-400 w-20">{formatCurrency(section.subtotal_net)}</span>
                </div>
              </div>
            ))}
            {/* Grand total ACTIF */}
            {totals && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-4 py-3 bg-blue-600 border-t border-blue-700">
                <span className="text-sm font-bold text-white uppercase">TOTAL ACTIF</span>
                <span className="text-sm font-bold text-right text-blue-100 w-20">{formatCurrency(totals.total_actif_brut)}</span>
                <span className="text-sm font-bold text-right text-blue-200 w-20">
                  {parseFloat(totals.total_actif_amortissement || '0') > 0 ? formatCurrency(totals.total_actif_amortissement) : '-'}
                </span>
                <span className="text-sm font-bold text-right text-white w-20">{formatCurrency(totals.total_actif_net)}</span>
              </div>
            )}
          </div>

          {/* PASSIF */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-emerald-600 px-4 py-3">
              <h2 className="text-base font-bold text-white uppercase tracking-wide">PASSIF</h2>
            </div>
            {/* Desktop table header */}
            <div className="hidden sm:flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              <span>Compte</span>
              <span>Montant</span>
            </div>
            {data.passif.map((section) => (
              <div key={section.section}>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{section.section}</span>
                </div>
                {section.lines.map((line) => (
                  <div key={line.account_code} className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-gray-400 mr-2">{line.account_code}</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{line.account_name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">{formatCurrency(line.montant)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Sous-total</span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(section.subtotal)}</span>
                </div>
              </div>
            ))}
            {/* Grand total PASSIF */}
            {totals && (
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 border-t border-emerald-700">
                <span className="text-sm font-bold text-white uppercase">TOTAL PASSIF</span>
                <span className="text-sm font-bold text-white">{formatCurrency(totals.total_passif)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
