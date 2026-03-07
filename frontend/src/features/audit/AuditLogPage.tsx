/** Journal d'audit — read-only log of all system actions. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { auditLogApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import type { AuditLog } from '@/api/types';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creation',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  LOGIN: 'Connexion',
  LOGOUT: 'Deconnexion',
  CANCEL: 'Annulation',
  VALIDATE: 'Validation',
  REFUND: 'Remboursement',
  PAYMENT: 'Paiement',
  STOCK_IN: 'Entree stock',
  STOCK_OUT: 'Sortie stock',
  ADJUSTMENT: 'Ajustement',
  TRANSFER: 'Transfert',
};

const ENTITY_LABELS: Record<string, string> = {
  Sale: 'Vente',
  Payment: 'Paiement',
  Product: 'Produit',
  ProductStock: 'Stock',
  Customer: 'Client',
  CashShift: 'Caisse',
  StockMovement: 'Mouvement',
  User: 'Utilisateur',
  Refund: 'Remboursement',
  PurchaseOrder: 'Commande achat',
  Expense: 'Depense',
  Quote: 'Devis',
  StockTransfer: 'Transfert',
  StockCount: 'Inventaire',
};

function ActionBadge({ action }: { action: string }) {
  const label = ACTION_LABELS[action] || action;
  let cls = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  if (action === 'CREATE') cls = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  else if (action === 'UPDATE') cls = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  else if (action === 'DELETE') cls = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  else if (action === 'CANCEL') cls = 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  else if (action === 'REFUND') cls = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
  else if (action === 'PAYMENT' || action === 'VALIDATE') cls = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function JsonDiffModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {ACTION_LABELS[log.action] || log.action} — {ENTITY_LABELS[log.entity_type] || log.entity_type}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div><span className="font-medium">Acteur :</span> {log.actor_name || '—'}</div>
            <div><span className="font-medium">Date :</span> {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}</div>
            <div><span className="font-medium">Entite :</span> {ENTITY_LABELS[log.entity_type] || log.entity_type} #{log.entity_id?.slice(0, 8)}</div>
            <div><span className="font-medium">IP :</span> {log.ip_address || '—'}</div>
          </div>

          {log.before_json && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Avant</h4>
              <pre className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-800 dark:text-red-300 overflow-x-auto max-h-48">
                {JSON.stringify(log.before_json, null, 2)}
              </pre>
            </div>
          )}
          {log.after_json && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Apres</h4>
              <pre className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 text-xs text-green-800 dark:text-green-300 overflow-x-auto max-h-48">
                {JSON.stringify(log.after_json, null, 2)}
              </pre>
            </div>
          )}
          {!log.before_json && !log.after_json && (
            <p className="text-sm text-gray-500 italic">Aucune donnee de modification enregistree.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const storeId = useStoreStore((s) => s.currentStore?.id);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const params: Record<string, string> = { page: String(page) };
  if (storeId) params.store = storeId;
  if (search) params.search = search;
  if (actionFilter) params.action = actionFilter;
  if (entityFilter) params.entity_type = entityFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditLogApi.list(params),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.count / 25) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Journal d'audit</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Historique de toutes les actions effectuees dans le systeme
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          {/* Action filter */}
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="">Toutes les actions</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Entity type filter */}
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={entityFilter}
              onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="">Tous les types</option>
              {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Acteur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">ID Entite</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">IP</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Detail</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </td>
                </tr>
              ) : !data?.results?.length ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    Aucune entree dans le journal d'audit.
                  </td>
                </tr>
              ) : (
                data.results.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd/MM/yy HH:mm', { locale: fr })}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {log.actor_name || <span className="text-gray-400 italic">Systeme</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {ENTITY_LABELS[log.entity_type] || log.entity_type}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {log.entity_id?.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                      {log.ip_address || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(log.before_json || log.after_json) ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="Voir les details"
                        >
                          <Eye size={16} />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {data!.count} entree{data!.count > 1 ? 's' : ''} — Page {page}/{totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedLog && <JsonDiffModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
