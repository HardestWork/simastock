/** Compte de resultat SYSCOHADA — produits et charges de l'exercice. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import apiClient from '@/api/client';
import type { CompteResultatData, FiscalYear, PaginatedResponse } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';

export default function CompteResultatPage() {
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
    queryKey: ['accounting', 'compte-resultat', params],
    queryFn: async () => {
      const { data } = await apiClient.get<CompteResultatData>('accounting/reports/compte-resultat/', { params });
      return data;
    },
    enabled: !!currentStore,
  });

  const totals = data?.totals;
  const hasData = data && (data.charges.length > 0 || data.produits.length > 0);
  const resultatNet = parseFloat(totals?.resultat_net ?? '0');
  const isBenefice = totals?.is_benefice ?? true;

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Compte de resultat</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Produits et charges de l'exercice fiscal
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

      {/* Result banner */}
      {hasData && totals && (
        <div className={`rounded-xl border p-4 sm:p-5 ${
          isBenefice
            ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
        }`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {isBenefice
                ? <TrendingUp size={28} className="text-green-600 dark:text-green-400 shrink-0" />
                : <TrendingDown size={28} className="text-red-600 dark:text-red-400 shrink-0" />
              }
              <div>
                <p className={`text-sm font-semibold ${isBenefice ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {isBenefice ? 'Benefice' : 'Perte nette'}
                </p>
                <p className={`text-2xl font-bold ${isBenefice ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                  {formatCurrency(Math.abs(resultatNet))}
                </p>
              </div>
            </div>
            <div className="flex gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total Produits</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totals.total_produits)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total Charges</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totals.total_charges)}</p>
              </div>
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
          {/* CHARGES */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-red-600 px-4 py-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-white uppercase tracking-wide">CHARGES</h2>
              {totals && <span className="text-sm font-semibold text-red-100">{formatCurrency(totals.total_charges)}</span>}
            </div>
            {data.charges.map((section) => (
              <div key={section.section}>
                <div className="bg-red-50 dark:bg-red-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase">{section.section}</span>
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
                <div className="flex items-center justify-between px-4 py-2 bg-red-50/50 dark:bg-red-900/10 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Sous-total</span>
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">{formatCurrency(section.subtotal)}</span>
                </div>
              </div>
            ))}
            {data.charges.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Aucune charge enregistree.
              </div>
            )}
            {totals && (
              <div className="flex items-center justify-between px-4 py-3 bg-red-600 border-t border-red-700">
                <span className="text-sm font-bold text-white uppercase">TOTAL CHARGES</span>
                <span className="text-sm font-bold text-white">{formatCurrency(totals.total_charges)}</span>
              </div>
            )}
          </div>

          {/* PRODUITS */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-green-600 px-4 py-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-white uppercase tracking-wide">PRODUITS</h2>
              {totals && <span className="text-sm font-semibold text-green-100">{formatCurrency(totals.total_produits)}</span>}
            </div>
            {data.produits.map((section) => (
              <div key={section.section}>
                <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase">{section.section}</span>
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
                <div className="flex items-center justify-between px-4 py-2 bg-green-50/50 dark:bg-green-900/10 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Sous-total</span>
                  <span className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(section.subtotal)}</span>
                </div>
              </div>
            ))}
            {data.produits.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Aucun produit enregistre.
              </div>
            )}
            {totals && (
              <div className="flex items-center justify-between px-4 py-3 bg-green-600 border-t border-green-700">
                <span className="text-sm font-bold text-white uppercase">TOTAL PRODUITS</span>
                <span className="text-sm font-bold text-white">{formatCurrency(totals.total_produits)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resultat net footer */}
      {hasData && totals && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
          isBenefice
            ? 'bg-green-600 border-green-700'
            : 'bg-red-600 border-red-700'
        }`}>
          <span className="text-sm font-bold text-white uppercase">
            RESULTAT NET — {isBenefice ? 'BENEFICE' : 'PERTE'}
          </span>
          <span className="text-lg font-bold text-white">{formatCurrency(Math.abs(resultatNet))}</span>
        </div>
      )}
    </div>
  );
}
