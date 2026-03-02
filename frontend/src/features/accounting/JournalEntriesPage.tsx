/** Ecritures comptables — liste des ecritures avec filtres, details expandables. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import apiClient from '@/api/client';
import type {
  AcctJournal,
  FiscalYear,
  JournalEntry,
  PaginatedResponse,
} from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { useDebounce } from '@/hooks/use-debounce';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PAGE_SIZE = 25;

type EntryStatus = 'DRAFT' | 'VALIDATED' | 'POSTED';

const statusConfig: Record<EntryStatus, { label: string; classes: string }> = {
  DRAFT: {
    label: 'Brouillon',
    classes: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  VALIDATED: {
    label: 'Validee',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  POSTED: {
    label: 'Comptabilisee',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
};

const SOURCE_TYPE_OPTIONS = [
  { value: '', label: 'Toutes sources' },
  { value: 'SALE', label: 'Vente' },
  { value: 'PURCHASE', label: 'Achat' },
  { value: 'EXPENSE', label: 'Depense' },
  { value: 'PAYMENT', label: 'Paiement' },
  { value: 'MANUAL', label: 'Manuel' },
  { value: 'OPENING', label: 'Ouverture' },
  { value: 'CLOSING', label: 'Cloture' },
];

export default function JournalEntriesPage() {
  const currentStore = useStoreStore((s) => s.currentStore);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [journalFilter, setJournalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [fiscalYearFilter, setFiscalYearFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, journalFilter, statusFilter, sourceFilter, fiscalYearFilter]);

  const { data: journalData } = useQuery({
    queryKey: ['accounting', 'journals', 'list-all'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<AcctJournal>>('accounting/journals/', {
        params: { page_size: '100' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

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
    const p: Record<string, string> = {
      page: String(page),
      page_size: String(PAGE_SIZE),
    };
    if (currentStore) p.store = currentStore.id;
    if (debouncedSearch) p.search = debouncedSearch;
    if (journalFilter) p.journal = journalFilter;
    if (statusFilter) p.status = statusFilter;
    if (sourceFilter) p.source_type = sourceFilter;
    if (fiscalYearFilter) p.fiscal_year = fiscalYearFilter;
    return p;
  }, [currentStore, page, debouncedSearch, journalFilter, statusFilter, sourceFilter, fiscalYearFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'journal-entries', 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<JournalEntry>>('accounting/journal-entries/', {
        params,
      });
      return data;
    },
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Ecritures comptables</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Journal des ecritures SYSCOHADA
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <div className="sm:col-span-2 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par libelle, reference..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <select
            value={journalFilter}
            onChange={(e) => setJournalFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Tous les journaux</option>
            {journalData?.results.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} - {j.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Tous statuts</option>
            <option value="DRAFT">Brouillon</option>
            <option value="VALIDATED">Validee</option>
            <option value="POSTED">Comptabilisee</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {data?.count ?? 0} ecriture(s)
          </span>
          <select
            value={fiscalYearFilter}
            onChange={(e) => setFiscalYearFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-xs dark:bg-gray-700 dark:text-gray-100 focus:outline-none"
          >
            <option value="">Tous exercices</option>
            {fiscalYearData?.results.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Mobile card list (shown below lg) */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700 lg:hidden">
              {data?.results.map((entry) => {
                const st = statusConfig[entry.status];
                const isExpanded = expandedId === entry.id;
                return (
                  <div key={entry.id}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(entry.id)}
                      className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                          <span className="font-mono text-xs font-medium text-gray-600 dark:text-gray-400">
                            {entry.journal_code}-{entry.sequence_number}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(new Date(entry.entry_date), 'dd/MM/yy', { locale: fr })}
                          </span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${st.classes}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate pl-5">
                        {entry.label}
                      </p>
                      <div className="flex items-center justify-between mt-1 pl-5">
                        <span className="text-xs text-gray-500">{entry.reference || entry.source_type || ''}</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(entry.total_debit)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded lines */}
                    {isExpanded && entry.lines && entry.lines.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 px-3 pb-3">
                        <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 pl-2">
                          Lignes
                        </div>
                        <div className="space-y-1">
                          {entry.lines.map((line) => (
                            <div key={line.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-2.5 py-1.5 text-xs">
                              <div className="min-w-0 flex-1">
                                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{line.account_code}</span>
                                <span className="text-gray-500 dark:text-gray-400 ml-1.5 truncate">{line.account_name}</span>
                              </div>
                              <div className="shrink-0 ml-2 text-right">
                                {parseFloat(line.debit) > 0 && (
                                  <span className="text-blue-700 dark:text-blue-400 font-medium">D {formatCurrency(line.debit)}</span>
                                )}
                                {parseFloat(line.credit) > 0 && (
                                  <span className="text-green-700 dark:text-green-400 font-medium">C {formatCurrency(line.credit)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {!entry.is_balanced && (
                          <div className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium pl-2">
                            Ecriture non equilibree
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {data?.results.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  Aucune ecriture comptable trouvee.
                </div>
              )}
            </div>

            {/* Desktop table (shown from lg) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="w-10 px-2 py-3" />
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Journal</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">N. Seq</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Libelle</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm hidden lg:table-cell">Reference</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Debit</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Credit</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-sm hidden lg:table-cell">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data?.results.map((entry) => {
                    const status = statusConfig[entry.status];
                    const isExpanded = expandedId === entry.id;
                    return (
                      <Fragment key={entry.id}>
                        <tr
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          onClick={() => toggleExpand(entry.id)}
                        >
                          <td className="px-2 py-3 text-center">
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-gray-400 inline" />
                            ) : (
                              <ChevronRight size={16} className="text-gray-400 inline" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {format(new Date(entry.entry_date), 'dd MMM yyyy', { locale: fr })}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{entry.journal_code}</span>
                            <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">{entry.journal_name}</span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{entry.sequence_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{entry.label}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{entry.reference || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatCurrency(entry.total_debit)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatCurrency(entry.total_credit)}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.classes}`}>{status.label}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{entry.source_type || '-'}</td>
                        </tr>

                        {isExpanded && entry.lines && entry.lines.length > 0 && (
                          <tr>
                            <td colSpan={10} className="bg-gray-50 dark:bg-gray-700/30 px-6 py-4">
                              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                                Lignes d'ecriture
                              </div>
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                                    <th className="text-left py-1 pr-4">Compte</th>
                                    <th className="text-left py-1 pr-4">Libelle</th>
                                    <th className="text-right py-1 pr-4">Debit</th>
                                    <th className="text-right py-1">Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.lines.map((line) => (
                                    <tr key={line.id} className="border-t border-gray-200 dark:border-gray-600">
                                      <td className="py-1.5 pr-4">
                                        <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{line.account_code}</span>
                                        <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">{line.account_name}</span>
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{line.label || '-'}</td>
                                      <td className="py-1.5 pr-4 text-right font-medium text-gray-900 dark:text-gray-100">
                                        {parseFloat(line.debit) > 0 ? formatCurrency(line.debit) : '-'}
                                      </td>
                                      <td className="py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">
                                        {parseFloat(line.credit) > 0 ? formatCurrency(line.credit) : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {!entry.is_balanced && (
                                <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
                                  Attention : cette ecriture n'est pas equilibree.
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {data?.results.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                        Aucune ecriture comptable trouvee.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer — always visible */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {data && data.count > 0
                  ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.count)} sur ${data.count}`
                  : '0 ecriture'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Page precedente"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-2">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Page suivante"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
