/** SAV (Service Apres-Vente) — Liste des dossiers + detail + creation. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savApi } from '@/api/endpoints';
import type { SAVTicket, SAVStatus, SAVPriority } from '@/api/types';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/lib/utils';
import {
  Search, Plus, X, ChevronRight, Wrench, Clock, CheckCircle2, AlertTriangle,
  XCircle, Package, RotateCcw, Eye, UserPlus, ClipboardList, ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  RECEIVED:        { label: 'Recu',              color: 'text-blue-700',   bg: 'bg-blue-100' },
  DIAGNOSING:      { label: 'En diagnostic',     color: 'text-purple-700', bg: 'bg-purple-100' },
  AWAITING_CLIENT: { label: 'Attente client',    color: 'text-yellow-700', bg: 'bg-yellow-100' },
  IN_REPAIR:       { label: 'En reparation',     color: 'text-orange-700', bg: 'bg-orange-100' },
  AWAITING_PART:   { label: 'Attente piece',     color: 'text-amber-700',  bg: 'bg-amber-100' },
  REPAIRED:        { label: 'Repare',            color: 'text-teal-700',   bg: 'bg-teal-100' },
  NOT_REPAIRABLE:  { label: 'Non reparable',     color: 'text-red-700',    bg: 'bg-red-100' },
  READY:           { label: 'Pret',              color: 'text-green-700',  bg: 'bg-green-100' },
  RETURNED:        { label: 'Restitue',          color: 'text-gray-700',   bg: 'bg-gray-100' },
  CLOSED:          { label: 'Cloture',           color: 'text-gray-500',   bg: 'bg-gray-50' },
  REFUSED:         { label: 'Refuse',            color: 'text-red-600',    bg: 'bg-red-50' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Basse',   color: 'text-gray-500' },
  MEDIUM: { label: 'Moyenne', color: 'text-blue-600' },
  HIGH:   { label: 'Haute',   color: 'text-orange-600' },
  URGENT: { label: 'Urgente', color: 'text-red-600' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.RECEIVED;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.color}`}>{c.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
  return <span className={`text-xs font-semibold ${c.color}`}>{c.label}</span>;
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SAVListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Queries
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (filterStatus) params.status = filterStatus;

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

  // Create mutation
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_email: '',
    brand_name: '', model_name: '', serial_number: '',
    product_condition: 'GOOD' as string, warranty_status: 'UNKNOWN' as string,
    declared_issue: '', accessories: '', priority: 'MEDIUM' as string, notes: '',
  });

  const createMut = useMutation({
    mutationFn: (d: typeof form) => savApi.create(d),
    onSuccess: () => {
      toast.success('Dossier SAV cree');
      qc.invalidateQueries({ queryKey: ['sav-tickets'] });
      qc.invalidateQueries({ queryKey: ['sav-dashboard'] });
      setShowCreate(false);
      resetForm();
    },
    onError: () => toast.error('Erreur lors de la creation'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      savApi.updateStatus(id, { status, reason }),
    onSuccess: () => {
      toast.success('Statut mis a jour');
      qc.invalidateQueries({ queryKey: ['sav-tickets'] });
      qc.invalidateQueries({ queryKey: ['sav-dashboard'] });
    },
    onError: () => toast.error('Erreur'),
  });

  function resetForm() {
    setForm({
      customer_name: '', customer_phone: '', customer_email: '',
      brand_name: '', model_name: '', serial_number: '',
      product_condition: 'GOOD', warranty_status: 'UNKNOWN',
      declared_issue: '', accessories: '', priority: 'MEDIUM', notes: '',
    });
  }

  const dash = dashQ.data;

  return (
    <div className="flex flex-col h-full">
      {/* Dashboard KPIs */}
      {dash && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-4 border-b bg-card">
          <KPI label="Recus ce mois" value={dash.month_received} />
          <KPI label="En cours" value={dash.total_active} accent />
          <KPI label="En diagnostic" value={dash.by_status.diagnosing || 0} />
          <KPI label="En reparation" value={dash.by_status.in_repair || 0} />
          <KPI label="Prets" value={dash.by_status.ready || 0} />
          <KPI label="Taux reparation" value={`${dash.repair_rate}%`} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher ref, client, S/N..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Nouveau dossier
        </button>
      </div>

      {/* Content: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className={`${selected ? 'hidden md:block md:w-1/2 lg:w-2/5' : 'w-full'} overflow-y-auto border-r`}>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Aucun dossier SAV</div>
          ) : (
            <div className="divide-y">
              {tickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`p-4 cursor-pointer hover:bg-accent/50 transition-colors ${selectedId === t.id ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold text-foreground">{t.reference}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t.brand_name} {t.model_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.customer_name} — {t.customer_phone}</div>
                  <div className="flex items-center justify-between mt-1">
                    <PriorityBadge priority={t.priority} />
                    <span className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{selected.reference}</h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-accent md:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} />
              <PriorityBadge priority={selected.priority} />
              {selected.warranty_status === 'UNDER' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Sous garantie</span>
              )}
            </div>

            {/* Product info */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Package className="w-4 h-4" /> Produit</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Marque:</span> <span className="font-medium">{selected.brand_name}</span></div>
                <div><span className="text-muted-foreground">Modele:</span> <span className="font-medium">{selected.model_name}</span></div>
                {selected.serial_number && <div><span className="text-muted-foreground">S/N:</span> <span className="font-mono">{selected.serial_number}</span></div>}
                <div><span className="text-muted-foreground">Etat:</span> {selected.condition_display}</div>
                <div><span className="text-muted-foreground">Garantie:</span> {selected.warranty_display}</div>
              </div>
            </div>

            {/* Client */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Client</h3>
              <div className="text-sm">
                <div className="font-medium">{selected.customer_name}</div>
                <div className="text-muted-foreground">{selected.customer_phone}</div>
                {selected.customer_email && <div className="text-muted-foreground">{selected.customer_email}</div>}
              </div>
            </div>

            {/* Issue */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Panne declaree</h3>
              <p className="text-sm text-foreground">{selected.declared_issue}</p>
              {selected.accessories && (
                <div className="text-sm"><span className="text-muted-foreground">Accessoires:</span> {selected.accessories}</div>
              )}
            </div>

            {/* Diagnosis */}
            {selected.diagnosis && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Diagnostic</h3>
                <p className="text-sm">{selected.diagnosis.diagnosis}</p>
                {selected.diagnosis.probable_cause && <p className="text-sm text-muted-foreground">Cause: {selected.diagnosis.probable_cause}</p>}
                {selected.diagnosis.proposed_solution && <p className="text-sm text-muted-foreground">Solution: {selected.diagnosis.proposed_solution}</p>}
                <div className="flex gap-4 text-sm">
                  <span>Cout estime: <strong>{formatCurrency(selected.diagnosis.estimated_cost)}</strong></span>
                  <span>Delai: <strong>{selected.diagnosis.estimated_days}j</strong></span>
                  <span>{selected.diagnosis.is_repairable ? '✓ Reparable' : '✗ Non reparable'}</span>
                </div>
              </div>
            )}

            {/* Repair actions */}
            {selected.repair_actions.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Wrench className="w-4 h-4" /> Reparations</h3>
                {selected.repair_actions.map(a => (
                  <div key={a.id} className="text-sm border-l-2 border-primary pl-3 py-1">
                    <p className="font-medium">{a.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.technician_name} — {fmtDate(a.created_at)}
                      {a.duration_minutes ? ` (${a.duration_minutes} min)` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Parts used */}
            {selected.parts_used.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Pieces utilisees</h3>
                {selected.parts_used.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.product_name || 'Piece'} x{p.quantity}</span>
                    <span className="font-medium">{formatCurrency(p.unit_cost * p.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            {selected.status_history.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Historique</h3>
                <div className="space-y-2">
                  {selected.status_history.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <ArrowRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <StatusBadge status={h.to_status} />
                        {h.reason && <span className="ml-2 text-muted-foreground">{h.reason}</span>}
                        <div className="text-muted-foreground mt-0.5">{h.changed_by_name} — {fmtDate(h.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Recu par: {selected.received_by_name || '-'}</div>
              <div>Technicien: {selected.technician_name || 'Non assigne'}</div>
              <div>Code restitution: <span className="font-mono font-bold">{selected.return_code}</span></div>
              <div>Cree le: {fmtDate(selected.created_at)}</div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {selected.status === 'RECEIVED' && (
                <ActionBtn
                  label="En diagnostic"
                  onClick={() => statusMut.mutate({ id: selected.id, status: 'DIAGNOSING' })}
                  color="bg-purple-600"
                />
              )}
              {selected.status === 'DIAGNOSING' && (
                <>
                  <ActionBtn
                    label="En reparation"
                    onClick={() => statusMut.mutate({ id: selected.id, status: 'IN_REPAIR' })}
                    color="bg-orange-600"
                  />
                  <ActionBtn
                    label="Non reparable"
                    onClick={() => statusMut.mutate({ id: selected.id, status: 'NOT_REPAIRABLE' })}
                    color="bg-red-600"
                  />
                </>
              )}
              {selected.status === 'AWAITING_CLIENT' && (
                <ActionBtn
                  label="Client accepte → Reparer"
                  onClick={() => statusMut.mutate({ id: selected.id, status: 'IN_REPAIR' })}
                  color="bg-orange-600"
                />
              )}
              {(selected.status === 'IN_REPAIR' || selected.status === 'AWAITING_PART') && (
                <>
                  <ActionBtn
                    label="Marquer repare"
                    onClick={() => statusMut.mutate({ id: selected.id, status: 'REPAIRED' })}
                    color="bg-teal-600"
                  />
                  {selected.status !== 'AWAITING_PART' && (
                    <ActionBtn
                      label="Attente piece"
                      onClick={() => statusMut.mutate({ id: selected.id, status: 'AWAITING_PART' })}
                      color="bg-amber-600"
                    />
                  )}
                </>
              )}
              {selected.status === 'REPAIRED' && (
                <ActionBtn
                  label="Pret a restituer"
                  onClick={() => statusMut.mutate({ id: selected.id, status: 'READY' })}
                  color="bg-green-600"
                />
              )}
              {selected.status === 'RETURNED' && (
                <ActionBtn
                  label="Cloturer"
                  onClick={() => statusMut.mutate({ id: selected.id, status: 'CLOSED' })}
                  color="bg-gray-600"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouveau dossier SAV</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 rounded hover:bg-accent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); createMut.mutate(form); }}
              className="space-y-4"
            >
              {/* Client */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-foreground">Client</legend>
                <input required placeholder="Nom du client *" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                <input required placeholder="Telephone *" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                <input placeholder="Email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
              </fieldset>

              {/* Product */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-foreground">Produit</legend>
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="Marque *" value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                    className="px-3 py-2 rounded-lg border bg-background text-sm" />
                  <input required placeholder="Modele *" value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                    className="px-3 py-2 rounded-lg border bg-background text-sm" />
                </div>
                <input placeholder="N° serie / IMEI" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
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
              </fieldset>

              {/* Issue */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-foreground">Panne</legend>
                <textarea required placeholder="Description de la panne *" value={form.declared_issue} onChange={e => setForm(f => ({ ...f, declared_issue: e.target.value }))}
                  rows={3} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                <input placeholder="Accessoires remis (chargeur, cable...)" value={form.accessories} onChange={e => setForm(f => ({ ...f, accessories: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
              </fieldset>

              {/* Priority */}
              <div>
                <label className="text-sm font-semibold text-foreground">Priorite</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm">
                  <option value="LOW">Basse</option>
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Haute</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>

              <textarea placeholder="Notes internes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />

              <button
                type="submit"
                disabled={createMut.isPending}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
              >
                {createMut.isPending ? 'Creation...' : 'Creer le dossier SAV'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-background rounded-lg p-3 border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-white text-xs font-medium ${color} hover:opacity-90`}>
      {label}
    </button>
  );
}
