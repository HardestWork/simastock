/** SAV (Service Apres-Vente) — Page complete avec gestion des dossiers. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savApi } from '@/api/endpoints';
import type { SAVTicket, SAVDashboard } from '@/api/types';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/lib/currency';
import { extractApiError } from '@/lib/api-error';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Search, Plus, X, Wrench, Clock, AlertTriangle, Phone, Mail, User,
  Package, ClipboardList, ArrowRight, Shield, Tag,
  ChevronDown, ChevronUp, CheckCircle, XCircle,
  RotateCcw, UserPlus, FileText,
  Calendar, TrendingUp, Activity, BarChart3, Star,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  RECEIVED:        { label: 'Recu',              classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  DIAGNOSING:      { label: 'En diagnostic',     classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  AWAITING_CLIENT: { label: 'Attente client',    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  IN_REPAIR:       { label: 'En reparation',     classes: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  AWAITING_PART:   { label: 'Attente piece',     classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  REPAIRED:        { label: 'Repare',            classes: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  NOT_REPAIRABLE:  { label: 'Non reparable',     classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  READY:           { label: 'Pret a restituer',  classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  RETURNED:        { label: 'Restitue',          classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400' },
  CLOSED:          { label: 'Cloture',           classes: 'bg-gray-50 text-gray-500 dark:bg-gray-800/30 dark:text-gray-500' },
  REFUSED:         { label: 'Refuse',            classes: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; classes: string; dot: string }> = {
  LOW:    { label: 'Basse',   classes: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400' },
  MEDIUM: { label: 'Moyenne', classes: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500' },
  HIGH:   { label: 'Haute',   classes: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  URGENT: { label: 'Urgente', classes: 'text-red-600 dark:text-red-400',     dot: 'bg-red-500' },
};

const WARRANTY_LABELS: Record<string, string> = {
  UNDER: 'Sous garantie', OUT: 'Hors garantie', UNKNOWN: 'A verifier',
};
const CONDITION_LABELS: Record<string, string> = {
  GOOD: 'Bon etat', SCRATCHED: 'Rayures', DAMAGED: 'Endommage', BROKEN: 'Casse',
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.RECEIVED;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.classes}`}>
      {c.label}
    </span>
  );
}

function PriorityIndicator({ priority }: { priority: string }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = 'tickets' | 'dashboard';

export default function SAVListPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('tickets');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const params: Record<string, string> = {};
  if (debouncedSearch) params.search = debouncedSearch;
  if (filterStatus) params.status = filterStatus;
  if (filterPriority) params.priority = filterPriority;

  const { data, isLoading } = useQuery({
    queryKey: ['sav-tickets', params],
    queryFn: () => savApi.list(params),
  });

  const dashQ = useQuery({
    queryKey: ['sav-dashboard'],
    queryFn: () => savApi.dashboard(),
  });

  const tickets = data?.results || [];
  const selected = tickets.find(t => t.id === selectedId) || null;
  const dash = dashQ.data;

  const tabs: { id: Tab; label: string; icon: typeof Wrench }[] = [
    { id: 'tickets', label: 'Dossiers', icon: FileText },
    { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              Service Apres-Vente
            </h1>
            {dash && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {dash.total_active} dossier{dash.total_active > 1 ? 's' : ''} en cours
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nouveau dossier
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-background text-foreground border border-b-0 border-border -mb-px'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'tickets' ? (
        <TicketsView
          tickets={tickets}
          isLoading={isLoading}
          search={search}
          setSearch={setSearch}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          dash={dash}
        />
      ) : (
        <DashboardView dash={dash} isLoading={dashQ.isLoading} />
      )}

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['sav-tickets'] });
            qc.invalidateQueries({ queryKey: ['sav-dashboard'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets View
// ---------------------------------------------------------------------------

function TicketsView({
  tickets, isLoading, search, setSearch, filterStatus, setFilterStatus,
  filterPriority, setFilterPriority, selected, selectedId, setSelectedId, dash,
}: {
  tickets: SAVTicket[]; isLoading: boolean;
  search: string; setSearch: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterPriority: string; setFilterPriority: (v: string) => void;
  selected: SAVTicket | null; selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  dash: SAVDashboard | undefined;
}) {
  return (
    <>
      {/* Quick stats */}
      {dash && (
        <div className="flex gap-2 px-4 py-3 border-b bg-card overflow-x-auto">
          <MiniStat label="Recus" value={dash.month_received} icon={Package} />
          <MiniStat label="En cours" value={dash.total_active} icon={Activity} accent />
          <MiniStat label="Diagnostic" value={dash.by_status.diagnosing || 0} icon={ClipboardList} />
          <MiniStat label="Reparation" value={dash.by_status.in_repair || 0} icon={Wrench} />
          <MiniStat label="Prets" value={dash.by_status.ready || 0} icon={CheckCircle} />
          <MiniStat label="Taux" value={`${dash.repair_rate}%`} icon={TrendingUp} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-card">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" placeholder="Rechercher ref, client, S/N, marque..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="">Toutes priorites</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className={`${selected ? 'hidden md:block md:w-[380px] lg:w-[420px]' : 'w-full'} overflow-y-auto border-r bg-card`}>
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16">
              <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Aucun dossier SAV</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tickets.map(t => (
                <div key={t.id} onClick={() => setSelectedId(t.id)}
                  className={`px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50 ${selectedId === t.id ? 'bg-accent border-l-3 border-l-primary' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-sm font-bold text-foreground">{t.reference}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">{t.brand_name} {t.model_name}</span>
                    {t.warranty_status === 'UNDER' && <Shield className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <User className="w-3 h-3" />
                    <span className="truncate">{t.customer_name}</span>
                    <span className="text-muted-foreground/50">|</span>
                    <Phone className="w-3 h-3" />
                    <span>{t.customer_phone}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <PriorityIndicator priority={t.priority} />
                    <span className="text-xs text-muted-foreground">{fmtShortDate(t.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {selected && <TicketDetail ticket={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ticket Detail
// ---------------------------------------------------------------------------

function TicketDetail({ ticket: t, onClose }: { ticket: SAVTicket; onClose: () => void }) {
  const qc = useQueryClient();
  const [showDiagnoseModal, setShowDiagnoseModal] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [expandTimeline, setExpandTimeline] = useState(false);

  const statusMut = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      savApi.updateStatus(t.id, { status, reason }),
    onSuccess: () => {
      toast.success('Statut mis a jour');
      qc.invalidateQueries({ queryKey: ['sav-tickets'] });
      qc.invalidateQueries({ queryKey: ['sav-dashboard'] });
    },
    onError: (err) => toast.error(extractApiError(err)),
  });

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">{t.reference}</h2>
              <StatusBadge status={t.status} />
              <PriorityIndicator priority={t.priority} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t.brand_name} {t.model_name}
              {t.serial_number && <span className="ml-2 font-mono text-xs">S/N: {t.serial_number}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Product + Client */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InfoCard title="Produit" icon={Package}>
            <InfoRow label="Marque" value={t.brand_name} />
            <InfoRow label="Modele" value={t.model_name} />
            {t.serial_number && <InfoRow label="S/N" value={t.serial_number} mono />}
            <InfoRow label="Etat" value={CONDITION_LABELS[t.product_condition] || t.product_condition} />
            <InfoRow
              label="Garantie"
              value={WARRANTY_LABELS[t.warranty_status] || t.warranty_status}
              badge={t.warranty_status === 'UNDER' ? 'green' : t.warranty_status === 'OUT' ? 'red' : 'yellow'}
            />
          </InfoCard>

          <InfoCard title="Client" icon={User}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-foreground">{t.customer_name}</div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.customer_phone}</span>
                  {t.customer_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{t.customer_email}</span>}
                </div>
              </div>
            </div>
            <InfoRow label="Recu par" value={t.received_by_name || '-'} />
            <InfoRow label="Technicien" value={t.technician_name || 'Non assigne'} />
            <InfoRow label="Code restitution" value={t.return_code} mono bold />
          </InfoCard>
        </div>

        {/* Issue */}
        <InfoCard title="Panne declaree" icon={AlertTriangle}>
          <p className="text-sm text-foreground leading-relaxed">{t.declared_issue}</p>
          {t.accessories && (
            <div className="mt-2 pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground">Accessoires remis :</span>
              <span className="text-sm text-foreground ml-1">{t.accessories}</span>
            </div>
          )}
          {t.notes && (
            <div className="mt-2 pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground">Notes :</span>
              <p className="text-sm text-foreground mt-0.5">{t.notes}</p>
            </div>
          )}
        </InfoCard>

        {/* Diagnosis */}
        {t.diagnosis && (
          <InfoCard title="Diagnostic" icon={ClipboardList}>
            <p className="text-sm text-foreground leading-relaxed">{t.diagnosis.diagnosis}</p>
            {t.diagnosis.probable_cause && (
              <div className="mt-2 text-sm"><span className="font-medium text-muted-foreground">Cause :</span> <span className="text-foreground">{t.diagnosis.probable_cause}</span></div>
            )}
            {t.diagnosis.proposed_solution && (
              <div className="mt-1 text-sm"><span className="font-medium text-muted-foreground">Solution :</span> <span className="text-foreground">{t.diagnosis.proposed_solution}</span></div>
            )}
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border text-sm">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Cout : <strong>{formatCurrency(t.diagnosis.estimated_cost)}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Delai : <strong>{t.diagnosis.estimated_days}j</strong>
              </div>
              <div className="flex items-center gap-1.5">
                {t.diagnosis.is_repairable
                  ? <><CheckCircle className="w-3.5 h-3.5 text-green-600" /> <span className="text-green-600 font-medium">Reparable</span></>
                  : <><XCircle className="w-3.5 h-3.5 text-red-600" /> <span className="text-red-600 font-medium">Non reparable</span></>
                }
              </div>
            </div>
            {t.diagnosis.parts_needed.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Pieces necessaires</div>
                {t.diagnosis.parts_needed.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2">
                      <span>{p.description} x{p.quantity}</span>
                      {p.in_stock
                        ? <span className="text-xs text-green-600 dark:text-green-400">En stock</span>
                        : <span className="text-xs text-red-600 dark:text-red-400">A commander</span>
                      }
                    </div>
                    <span className="font-medium">{formatCurrency(p.unit_cost * p.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </InfoCard>
        )}

        {/* Repair Actions */}
        {t.repair_actions.length > 0 && (
          <InfoCard title="Actions de reparation" icon={Wrench}>
            <div className="space-y-3">
              {t.repair_actions.map(a => (
                <div key={a.id} className="border-l-2 border-primary/60 pl-3 py-1">
                  <p className="text-sm font-medium text-foreground">{a.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                    {a.technician_name && <span className="flex items-center gap-1"><UserPlus className="w-3 h-3" />{a.technician_name}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(a.created_at)}</span>
                    {a.duration_minutes && <span>{a.duration_minutes} min</span>}
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>}
                </div>
              ))}
            </div>
          </InfoCard>
        )}

        {/* Parts Used */}
        {t.parts_used.length > 0 && (
          <InfoCard title="Pieces utilisees" icon={Package}>
            <div className="divide-y divide-border">
              {t.parts_used.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{p.product_name || 'Piece'}</span>
                    <span className="text-muted-foreground ml-1.5">x{p.quantity}</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(p.unit_cost * p.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-bold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(t.parts_used.reduce((s, p) => s + p.unit_cost * p.quantity, 0))}</span>
              </div>
            </div>
          </InfoCard>
        )}

        {/* Quotes */}
        {t.quotes.length > 0 && (
          <InfoCard title="Devis" icon={FileText}>
            {t.quotes.map(q => (
              <div key={q.id} className="border rounded-lg p-3 mb-2 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-bold">{q.reference}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    q.status === 'ACCEPTED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    q.status === 'REFUSED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                  }`}>{q.status}</span>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Pieces: {formatCurrency(q.parts_total)}</span>
                  <span>M.O: {formatCurrency(q.labor_cost)}</span>
                  <span className="font-bold text-foreground">Total: {formatCurrency(q.total)}</span>
                </div>
              </div>
            ))}
          </InfoCard>
        )}

        {/* Paid repair banner */}
        {t.is_paid_repair && t.total_cost > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Reparation payante</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(t.total_cost)}</span>
          </div>
        )}

        {/* Timeline */}
        {t.status_history.length > 0 && (
          <InfoCard title="Historique" icon={Clock}>
            <div className="space-y-2.5">
              {(expandTimeline ? t.status_history : t.status_history.slice(0, 4)).map(h => (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={h.to_status} />
                      {h.reason && <span className="text-xs text-muted-foreground truncate">{h.reason}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {h.changed_by_name || 'Systeme'} — {fmtDate(h.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              {t.status_history.length > 4 && (
                <button onClick={() => setExpandTimeline(!expandTimeline)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  {expandTimeline ? <><ChevronUp className="w-3 h-3" /> Voir moins</> : <><ChevronDown className="w-3 h-3" /> Voir tout ({t.status_history.length})</>}
                </button>
              )}
            </div>
          </InfoCard>
        )}

        {/* Key dates */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <DateItem label="Cree le" value={t.created_at} />
          {t.diagnosed_at && <DateItem label="Diagnostique" value={t.diagnosed_at} />}
          {t.repair_started_at && <DateItem label="Reparation" value={t.repair_started_at} />}
          {t.repaired_at && <DateItem label="Repare" value={t.repaired_at} />}
          {t.returned_at && <DateItem label="Restitue" value={t.returned_at} />}
          {t.closed_at && <DateItem label="Cloture" value={t.closed_at} />}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
          {t.status === 'RECEIVED' && (
            <>
              <ActionBtn label="Diagnostiquer" icon={ClipboardList} color="bg-purple-600 hover:bg-purple-700" onClick={() => setShowDiagnoseModal(true)} />
              <ActionBtn label="En diagnostic" icon={ArrowRight} color="bg-purple-600/80 hover:bg-purple-700" onClick={() => statusMut.mutate({ status: 'DIAGNOSING' })} />
            </>
          )}
          {t.status === 'DIAGNOSING' && (
            <>
              <ActionBtn label="Diagnostiquer" icon={ClipboardList} color="bg-purple-600 hover:bg-purple-700" onClick={() => setShowDiagnoseModal(true)} />
              <ActionBtn label="En reparation" icon={Wrench} color="bg-orange-600 hover:bg-orange-700" onClick={() => statusMut.mutate({ status: 'IN_REPAIR' })} />
              <ActionBtn label="Non reparable" icon={XCircle} color="bg-red-600 hover:bg-red-700" onClick={() => statusMut.mutate({ status: 'NOT_REPAIRABLE' })} />
            </>
          )}
          {t.status === 'AWAITING_CLIENT' && (
            <>
              <ActionBtn label="Client accepte" icon={CheckCircle} color="bg-green-600 hover:bg-green-700" onClick={() => statusMut.mutate({ status: 'IN_REPAIR' })} />
              <ActionBtn label="Client refuse" icon={XCircle} color="bg-red-600 hover:bg-red-700" onClick={() => statusMut.mutate({ status: 'REFUSED' })} />
            </>
          )}
          {(t.status === 'IN_REPAIR' || t.status === 'AWAITING_PART') && (
            <>
              <ActionBtn label="Ajouter reparation" icon={Wrench} color="bg-orange-600 hover:bg-orange-700" onClick={() => setShowRepairModal(true)} />
              <ActionBtn label="Repare" icon={CheckCircle} color="bg-teal-600 hover:bg-teal-700" onClick={() => statusMut.mutate({ status: 'REPAIRED' })} />
              {t.status !== 'AWAITING_PART' && (
                <ActionBtn label="Attente piece" icon={Package} color="bg-amber-600 hover:bg-amber-700" onClick={() => statusMut.mutate({ status: 'AWAITING_PART' })} />
              )}
            </>
          )}
          {t.status === 'REPAIRED' && (
            <ActionBtn label="Pret a restituer" icon={CheckCircle} color="bg-green-600 hover:bg-green-700" onClick={() => statusMut.mutate({ status: 'READY' })} />
          )}
          {t.status === 'READY' && (
            <ActionBtn label="Restituer" icon={RotateCcw} color="bg-blue-600 hover:bg-blue-700" onClick={() => setShowReturnModal(true)} />
          )}
          {t.status === 'RETURNED' && (
            <ActionBtn label="Cloturer" icon={CheckCircle} color="bg-gray-600 hover:bg-gray-700" onClick={() => statusMut.mutate({ status: 'CLOSED' })} />
          )}
        </div>
      </div>

      {showDiagnoseModal && <DiagnoseModal ticketId={t.id} onClose={() => setShowDiagnoseModal(false)} />}
      {showRepairModal && <RepairActionModal ticketId={t.id} onClose={() => setShowRepairModal(false)} />}
      {showReturnModal && <ReturnModal ticketId={t.id} onClose={() => setShowReturnModal(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard View
// ---------------------------------------------------------------------------

function DashboardView({ dash, isLoading }: { dash: SAVDashboard | undefined; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!dash) return null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DashCard label="Recus ce mois" value={dash.month_received} icon={Package} color="text-blue-600" />
        <DashCard label="En cours" value={dash.total_active} icon={Activity} color="text-primary" />
        <DashCard label="En diagnostic" value={dash.by_status.diagnosing || 0} icon={ClipboardList} color="text-purple-600" />
        <DashCard label="En reparation" value={dash.by_status.in_repair || 0} icon={Wrench} color="text-orange-600" />
        <DashCard label="Prets" value={dash.by_status.ready || 0} icon={CheckCircle} color="text-green-600" />
        <DashCard label="Taux reparation" value={`${dash.repair_rate}%`} icon={TrendingUp} color="text-teal-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Repartition par statut
          </h3>
          <div className="space-y-3">
            {Object.entries(dash.by_status).map(([key, count]) => {
              const statusKey = key.toUpperCase().replace(/ /g, '_');
              const cfg = STATUS_CONFIG[statusKey];
              if (!cfg || count === 0) return null;
              const pct = dash.total_active > 0 ? Math.round((count / dash.total_active) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground">{cfg.label}</span>
                    <span className="font-semibold">{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top brands */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" /> Top marques
          </h3>
          {dash.top_brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnee</p>
          ) : (
            <div className="space-y-3">
              {dash.top_brands.map((b, i) => (
                <div key={b.brand_name} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    i === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  }`}>{i + 1}</span>
                  <span className="text-sm font-medium text-foreground flex-1">{b.brand_name}</span>
                  <span className="text-sm font-semibold text-foreground">{b.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dash.avg_repair_days !== null && (
        <div className="bg-card rounded-xl border p-5 flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Duree moyenne de reparation :</span>
          <span className="font-bold text-foreground">{dash.avg_repair_days} jour{dash.avg_repair_days > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function DiagnoseModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    diagnosis: '', probable_cause: '', proposed_solution: '',
    estimated_cost: '', estimated_days: '1', is_repairable: true,
  });
  const mut = useMutation({
    mutationFn: () => savApi.diagnose(ticketId, {
      ...form, estimated_cost: parseFloat(form.estimated_cost) || 0, estimated_days: parseInt(form.estimated_days) || 1,
    }),
    onSuccess: () => { toast.success('Diagnostic enregistre'); qc.invalidateQueries({ queryKey: ['sav-tickets'] }); qc.invalidateQueries({ queryKey: ['sav-dashboard'] }); onClose(); },
    onError: (err) => toast.error(extractApiError(err)),
  });

  return (
    <Modal title="Diagnostic technique" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
        <textarea required placeholder="Diagnostic *" value={form.diagnosis}
          onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
          rows={3} className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <input placeholder="Cause probable" value={form.probable_cause}
          onChange={e => setForm(f => ({ ...f, probable_cause: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <input placeholder="Solution proposee" value={form.proposed_solution}
          onChange={e => setForm(f => ({ ...f, proposed_solution: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cout estime (FCFA)</label>
            <input type="number" placeholder="0" value={form.estimated_cost}
              onChange={e => setForm(f => ({ ...f, estimated_cost: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Delai (jours)</label>
            <input type="number" min="1" value={form.estimated_days}
              onChange={e => setForm(f => ({ ...f, estimated_days: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_repairable} onChange={e => setForm(f => ({ ...f, is_repairable: e.target.checked }))} className="rounded border-border" />
          Reparable
        </label>
        <button type="submit" disabled={mut.isPending}
          className="w-full py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {mut.isPending ? 'Enregistrement...' : 'Enregistrer le diagnostic'}
        </button>
      </form>
    </Modal>
  );
}

function RepairActionModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ description: '', duration_minutes: '', notes: '' });
  const mut = useMutation({
    mutationFn: () => savApi.addRepairAction(ticketId, {
      description: form.description,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { toast.success('Action ajoutee'); qc.invalidateQueries({ queryKey: ['sav-tickets'] }); onClose(); },
    onError: (err) => toast.error(extractApiError(err)),
  });

  return (
    <Modal title="Ajouter une action de reparation" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
        <textarea required placeholder="Description de l'action *" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={3} className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <div>
          <label className="text-xs font-medium text-muted-foreground">Duree (minutes)</label>
          <input type="number" placeholder="45" value={form.duration_minutes}
            onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
            className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <textarea placeholder="Notes" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button type="submit" disabled={mut.isPending}
          className="w-full py-2.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">
          {mut.isPending ? 'Ajout...' : "Ajouter l'action"}
        </button>
      </form>
    </Modal>
  );
}

function ReturnModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [returnedTo, setReturnedTo] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const mut = useMutation({
    mutationFn: () => savApi.confirmReturn(ticketId, { code, returned_to: returnedTo || undefined, return_notes: returnNotes || undefined }),
    onSuccess: () => { toast.success('Restitution confirmee'); qc.invalidateQueries({ queryKey: ['sav-tickets'] }); qc.invalidateQueries({ queryKey: ['sav-dashboard'] }); onClose(); },
    onError: (err) => toast.error(extractApiError(err)),
  });

  return (
    <Modal title="Confirmer la restitution" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Code de restitution (6 chiffres)</label>
          <input type="text" required maxLength={6} placeholder="______" value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full mt-1 px-3 py-3 rounded-lg border bg-background text-center text-xl font-mono font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <input placeholder="Restitue a (nom)" value={returnedTo} onChange={e => setReturnedTo(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <textarea placeholder="Notes de restitution" value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
          rows={2} className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button type="submit" disabled={mut.isPending || code.length !== 6}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {mut.isPending ? 'Verification...' : 'Confirmer la restitution'}
        </button>
      </form>
    </Modal>
  );
}

function CreateTicketModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_email: '',
    brand_name: '', model_name: '', serial_number: '',
    product_condition: 'GOOD', warranty_status: 'UNKNOWN',
    declared_issue: '', accessories: '', priority: 'MEDIUM', notes: '',
  });
  const mut = useMutation({
    mutationFn: () => savApi.create(form as unknown as Partial<SAVTicket>),
    onSuccess: () => { toast.success('Dossier SAV cree'); onSuccess(); },
    onError: (err) => toast.error(extractApiError(err)),
  });

  return (
    <Modal title="Nouveau dossier SAV" onClose={onClose} wide>
      <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-5">
        <FormSection title="Client" icon={User}>
          <input required placeholder="Nom du client *" value={form.customer_name}
            onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="Telephone *" value={form.customer_phone}
              onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input placeholder="Email" value={form.customer_email}
              onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </FormSection>

        <FormSection title="Produit" icon={Package}>
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="Marque *" value={form.brand_name}
              onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input required placeholder="Modele *" value={form.model_name}
              onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <input placeholder="N de serie / IMEI" value={form.serial_number}
            onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.product_condition} onChange={e => setForm(f => ({ ...f, product_condition: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="GOOD">Bon etat</option>
              <option value="SCRATCHED">Rayures</option>
              <option value="DAMAGED">Endommage</option>
              <option value="BROKEN">Casse</option>
            </select>
            <select value={form.warranty_status} onChange={e => setForm(f => ({ ...f, warranty_status: e.target.value }))}
              className="px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="UNKNOWN">Garantie a verifier</option>
              <option value="UNDER">Sous garantie</option>
              <option value="OUT">Hors garantie</option>
            </select>
          </div>
        </FormSection>

        <FormSection title="Panne" icon={AlertTriangle}>
          <textarea required placeholder="Description de la panne *" value={form.declared_issue}
            onChange={e => setForm(f => ({ ...f, declared_issue: e.target.value }))}
            rows={3} className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <input placeholder="Accessoires remis (chargeur, cable...)" value={form.accessories}
            onChange={e => setForm(f => ({ ...f, accessories: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </FormSection>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priorite</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="LOW">Basse</option>
              <option value="MEDIUM">Moyenne</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes internes</label>
            <input placeholder="Notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <button type="submit" disabled={mut.isPending}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
          {mut.isPending ? 'Creation...' : 'Creer le dossier SAV'}
        </button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-card rounded-xl shadow-2xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 z-10 bg-card border-b px-5 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function InfoCard({ title, icon: Icon, children }: { title: string; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono, bold, badge }: {
  label: string; value: string; mono?: boolean; bold?: boolean;
  badge?: 'green' | 'red' | 'yellow';
}) {
  const badgeCls = badge === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : badge === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : badge === 'yellow' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : '';
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {badge
        ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls}`}>{value}</span>
        : <span className={`text-foreground ${mono ? 'font-mono' : ''} ${bold ? 'font-bold text-base' : 'font-medium'}`}>{value}</span>
      }
    </div>
  );
}

function FormSection({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </legend>
      {children}
    </fieldset>
  );
}

function DateItem({ label, value }: { label: string; value: string }) {
  return <div><span className="block font-medium">{label}</span>{fmtDate(value)}</div>;
}

function MiniStat({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Clock; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border whitespace-nowrap">
      <Icon className={`w-3.5 h-3.5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function DashCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Clock; color: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ActionBtn({ label, icon: Icon, color, onClick }: { label: string; icon: typeof Clock; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors ${color}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
