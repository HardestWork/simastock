import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStoreStore } from '@/store-context/store-store';
import { useAuthStore } from '@/auth/auth-store';
import { deliveryApi, saleApi, agentObjectivesApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import {
  Truck, MapPin, Users, Plus, Search, X,
  Package, Clock, CheckCircle, AlertTriangle,
  Bell, BarChart2, Target, Radio, UserCheck, KeyRound,
} from 'lucide-react';
import type {
  Delivery, DeliveryZone, DeliveryAgent, DeliveryPickupLocation,
  DeliveryStatus, Sale, AgentObjective,
} from '@/api/types';

const PAGE_SIZE = 25;

type Tab = 'deliveries' | 'available' | 'zones' | 'agents' | 'stats' | 'objectives';

/** Génère un lien WhatsApp avec les infos de livraison pré-remplies. */
function buildWhatsAppUrl(d: Delivery): string {
  const pickup = d.pickup_location_name
    ? `${d.pickup_location_name}${d.pickup_notes ? ` (${d.pickup_notes})` : ''}`
    : d.pickup_notes || 'Voir responsable';

  const itemsLines = d.sale_items_summary?.length
    ? ['📋 *Articles :*', ...d.sale_items_summary.map((i) => `  • ${i.name} × ${i.quantity}`)]
    : [];

  const lines = [
    `🚚 *Livraison #${d.confirmation_code}*`,
    '',
    `📦 *Récupération :* ${pickup}`,
    ...itemsLines,
    `📍 *Destination :* ${d.delivery_address}`,
    `👤 *Destinataire :* ${d.recipient_name}`,
    `📞 *Tél :* ${d.recipient_phone}`,
    d.payout_amount ? `💰 *Montant :* ${d.payout_amount} FCFA` : '',
    `🔑 *Code :* ${d.confirmation_code}`,
  ].filter(Boolean).join('\n');

  const encoded = encodeURIComponent(lines);
  if (d.agent_phone) {
    const phone = d.agent_phone.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: 'En attente',
  PREPARING: 'En preparation',
  READY: 'Pret',
  IN_TRANSIT: 'En transit',
  DELIVERED: 'Livre',
  RETURNED: 'Retourne',
  CANCELLED: 'Annule',
};

const STATUS_CLASSES: Record<DeliveryStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PREPARING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  READY: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  IN_TRANSIT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  RETURNED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
};

const VEHICLE_LABELS: Record<string, string> = {
  MOTO: 'Moto',
  VOITURE: 'Voiture',
  VELO: 'Velo',
  PIETON: 'Pieton',
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Deliveries Tab
// ---------------------------------------------------------------------------

function DeliveriesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDeliveryRole = user?.role === 'DELIVERY';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const listParams = useMemo(() => {
    const p: Record<string, string> = {
      store: storeId,
      page: String(page),
      page_size: String(PAGE_SIZE),
      ordering: '-created_at',
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter) p.status = statusFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [storeId, page, debouncedSearch, statusFilter, dateFrom, dateTo]);

  const { data: dashboard } = useQuery({
    queryKey: queryKeys.delivery.deliveries.dashboard,
    queryFn: () => deliveryApi.deliveries.dashboard(),
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.delivery.deliveries.list(listParams),
    queryFn: () => deliveryApi.deliveries.list(listParams),
  });

  const { data: zonesData } = useQuery({
    queryKey: queryKeys.delivery.zones.list({ store: storeId, page_size: '200', is_active: 'true' }),
    queryFn: () => deliveryApi.zones.list({ store: storeId, page_size: '200', is_active: 'true' }),
  });

  const { data: agentsData } = useQuery({
    queryKey: queryKeys.delivery.agents.list({ store: storeId, page_size: '200', is_active: 'true' }),
    queryFn: () => deliveryApi.agents.list({ store: storeId, page_size: '200', is_active: 'true' }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      deliveryApi.deliveries.updateStatus(id, { status }),
    onSuccess: () => {
      toast.success('Statut mis a jour');
      setStatusDropdownId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur lors de la mise a jour du statut')),
  });

  // Notify agent state
  const [notifyTarget, setNotifyTarget] = useState<Delivery | null>(null);
  const [notifyChannel, setNotifyChannel] = useState<'SMS' | 'WHATSAPP'>('SMS');
  const [notifyMessage, setNotifyMessage] = useState('');

  const notifyMutation = useMutation({
    mutationFn: (delivery: Delivery) =>
      deliveryApi.deliveries.notifyAgent(delivery.id, { channel: notifyChannel, message: notifyMessage.trim() || undefined }),
    onSuccess: () => {
      toast.success('Notification envoyee au livreur');
      setNotifyTarget(null);
      setNotifyMessage('');
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur lors de l\'envoi')),
  });

  function openNotifyModal(d: Delivery) {
    setNotifyTarget(d);
    setNotifyChannel('SMS');
    setNotifyMessage(
      `Livraison #${d.confirmation_code} — Destinataire: ${d.recipient_name} (${d.recipient_phone}) — Adresse: ${d.delivery_address}`
    );
  }

  // Create delivery form state
  const [formSaleId, setFormSaleId] = useState('');
  const [formSaleSearch, setFormSaleSearch] = useState('');
  const [formSaleLabel, setFormSaleLabel] = useState('');
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const debouncedSaleSearch = useDebounce(formSaleSearch, 300);
  const { data: saleSearchData } = useQuery({
    queryKey: queryKeys.sales.list({ search: debouncedSaleSearch, status: 'PAID', page_size: '8' }),
    queryFn: () => saleApi.list({ search: debouncedSaleSearch, status: 'PAID', page_size: '8' }),
    enabled: debouncedSaleSearch.length >= 2 && showSaleDropdown,
  });
  const [formRecipient, setFormRecipient] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formAgent, setFormAgent] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPayoutAmount, setFormPayoutAmount] = useState('');
  const [formPickupLocation, setFormPickupLocation] = useState('');
  const [formPickupNotes, setFormPickupNotes] = useState('');

  const { data: pickupLocationsData } = useQuery({
    queryKey: queryKeys.delivery.pickupLocations.list({ store: storeId, page_size: '200', is_active: 'true' }),
    queryFn: () => deliveryApi.pickupLocations.list({ store: storeId, page_size: '200', is_active: 'true' }),
  });

  // Escalate state
  const [escalateTarget, setEscalateTarget] = useState<Delivery | null>(null);
  const [escalateReason, setEscalateReason] = useState('');

  const escalateMutation = useMutation({
    mutationFn: (delivery: Delivery) =>
      deliveryApi.deliveries.escalate(delivery.id, { reason: escalateReason.trim() || undefined }),
    onSuccess: () => {
      toast.success('Alerte de retard signalee');
      setEscalateTarget(null);
      setEscalateReason('');
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  // Pickup flow
  const [pickupTarget, setPickupTarget] = useState<Delivery | null>(null);
  const [pickupCode, setPickupCode] = useState('');

  const markReadyMut = useMutation({
    mutationFn: (id: string) => deliveryApi.deliveries.markReady(id),
    onSuccess: () => {
      toast.success('Colis marque pret a la recuperation');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  const confirmPickupMut = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      deliveryApi.deliveries.confirmPickup(id, { code }),
    onSuccess: () => {
      toast.success('Recuperation confirmee — livraison en cours');
      setPickupTarget(null);
      setPickupCode('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Code invalide ou erreur')),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      deliveryApi.deliveries.create({
        store: storeId,
        sale: formSaleId || undefined,
        recipient_name: formRecipient.trim(),
        recipient_phone: formPhone.trim(),
        delivery_address: formAddress.trim(),
        zone: formZone || undefined,
        agent: formAgent || undefined,
        notes: formNotes.trim(),
        payout_amount: formPayoutAmount ? formPayoutAmount : undefined,
        pickup_location: formPickupLocation || undefined,
        pickup_notes: formPickupNotes.trim() || undefined,
      } as Partial<Delivery>),
    onSuccess: () => {
      toast.success('Livraison creee avec succes');
      setOpenCreate(false);
      resetCreateForm();
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur lors de la creation')),
  });

  function resetCreateForm() {
    setFormSaleId('');
    setFormSaleSearch('');
    setFormSaleLabel('');
    setShowSaleDropdown(false);
    setFormRecipient('');
    setFormPhone('');
    setFormAddress('');
    setFormZone('');
    setFormAgent('');
    setFormNotes('');
    setFormPayoutAmount('');
    setFormPickupLocation('');
    setFormPickupNotes('');
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  const statCards: { label: string; value: number; icon: React.ReactNode; color: string }[] = [
    { label: 'En attente', value: dashboard?.pending ?? 0, icon: <Clock size={20} />, color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400' },
    { label: 'En transit', value: dashboard?.in_transit ?? 0, icon: <Truck size={20} />, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400' },
    { label: 'Livres', value: dashboard?.delivered ?? 0, icon: <CheckCircle size={20} />, color: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' },
    { label: 'Retournes', value: dashboard?.returned ?? 0, icon: <AlertTriangle size={20} />, color: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' },
    { label: 'Diffusees', value: dashboard?.broadcast ?? 0, icon: <Radio size={20} />, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400' },
  ];

  function getNextStatuses(current: DeliveryStatus): DeliveryStatus[] {
    const flow: Record<DeliveryStatus, DeliveryStatus[]> = {
      PENDING: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'RETURNED'],
      DELIVERED: [],
      RETURNED: [],
      CANCELLED: [],
    };
    return flow[current] ?? [];
  }

  return (
    <>
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.color}`}>{card.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher ref, destinataire, telephone..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Tous statuts</option>
            {(Object.keys(STATUS_LABELS) as DeliveryStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder="Date debut"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder="Date fin"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{data?.count ?? 0} livraison(s)</span>
          {!isDeliveryRole && (
            <button
              onClick={() => setOpenCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus size={16} />
              Nouvelle livraison
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-visible">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Ref Vente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Destinataire</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Telephone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Adresse</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Zone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {d.sale_invoice ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{d.recipient_name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{d.recipient_phone}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                    {d.delivery_address}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{d.zone_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {d.is_broadcast ? (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <Radio size={12} />
                        Diffuse
                      </span>
                    ) : (d.agent_name ?? '-')}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {new Date(d.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-right relative" onClick={(e) => e.stopPropagation()}>
                    {!isDeliveryRole && getNextStatuses(d.status).length > 0 && (
                      <div className="relative inline-block">
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === d.id ? null : d.id)}
                          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Changer statut
                        </button>
                        {statusDropdownId === d.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1">
                            {getNextStatuses(d.status).map((ns) => (
                              <button
                                key={ns}
                                onClick={() => statusMutation.mutate({ id: d.id, status: ns })}
                                disabled={statusMutation.isPending}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                {STATUS_LABELS[ns]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucune livraison trouvee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Expanded detail row */}
      {expandedId && data?.results.find((d) => d.id === expandedId) && (() => {
        const d = data.results.find((d) => d.id === expandedId)!;
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mt-3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detail livraison - {d.sale_invoice ?? d.id.slice(0, 8)}
                </h3>
                {d.is_broadcast && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    <Radio size={10} />
                    DIFFUSEE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Marquer prêt — visible stocker/manager si PENDING ou PREPARING */}
                {!isDeliveryRole && (d.status === 'PENDING' || d.status === 'PREPARING') && (
                  <button
                    onClick={() => markReadyMut.mutate(d.id)}
                    disabled={markReadyMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800 disabled:opacity-60"
                  >
                    <CheckCircle size={14} />
                    Marquer pret
                  </button>
                )}
                {/* Confirmer récupération — visible si PENDING/PREPARING/READY */}
                {(d.status === 'PENDING' || d.status === 'PREPARING' || d.status === 'READY') && (
                  <button
                    onClick={() => { setPickupTarget(d); setPickupCode(''); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800"
                  >
                    <KeyRound size={14} />
                    Confirmer recuperation
                  </button>
                )}
                {d.agent && (
                  <button
                    onClick={() => openNotifyModal(d)}
                    title="Notifier le livreur"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                  >
                    <Bell size={14} />
                    Notifier le livreur
                  </button>
                )}
                <a
                  href={buildWhatsAppUrl(d)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={d.agent_name ? `Envoyer à ${d.agent_name} sur WhatsApp` : 'Partager via WhatsApp'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {d.agent_name ? 'WhatsApp livreur' : 'Partager WhatsApp'}
                </a>
                <button
                  onClick={() => { setEscalateTarget(d); setEscalateReason(''); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                >
                  <AlertTriangle size={14} />
                  Signaler retard
                </button>
                <button onClick={() => setExpandedId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Destinataire</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.recipient_name}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Telephone</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.recipient_phone}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Adresse</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.delivery_address}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Zone</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.zone_name ?? '-'}
                  {d.zone_fee && <span className="ml-1 text-gray-500">({formatCurrency(d.zone_fee)})</span>}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Agent</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.is_broadcast ? (
                    <span className="text-purple-600 dark:text-purple-400">En attente de livreur</span>
                  ) : (d.agent_name ?? '-')}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Cree par</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.seller_name ?? '-'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Emplacement colis</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.pickup_location_name ?? '-'}
                  {d.pickup_notes && <span className="ml-1 text-gray-500 text-xs">({d.pickup_notes})</span>}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Code confirmation</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.confirmation_code || '-'}</p>
              </div>
              {!isDeliveryRole && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Code recuperation</p>
                  <p className="font-mono font-bold text-indigo-700 dark:text-indigo-400 tracking-widest text-lg">
                    {d.pickup_code || '-'}
                  </p>
                </div>
              )}
              {d.pickup_confirmed_at && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Recupere le</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(d.pickup_confirmed_at).toLocaleString('fr-FR')}
                    {d.pickup_confirmed_by_name && (
                      <span className="ml-1 text-gray-500 text-xs">par {d.pickup_confirmed_by_name}</span>
                    )}
                  </p>
                </div>
              )}
              <div>
                <p className="text-gray-500 dark:text-gray-400">Montant livreur</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.payout_amount ? formatCurrency(d.payout_amount) : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Depense caisse</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.expense_number ?? (d.status === 'IN_TRANSIT' || d.status === 'DELIVERED' || d.status === 'RETURNED' ? '-' : 'En attente (avant EN COURS)')}
                </p>
              </div>
              {d.scheduled_at && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Planifie le</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{new Date(d.scheduled_at).toLocaleString('fr-FR')}</p>
                </div>
              )}
              {d.delivered_at && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Livre le</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{new Date(d.delivered_at).toLocaleString('fr-FR')}</p>
                </div>
              )}
              {d.notes && (
                <div className="md:col-span-3">
                  <p className="text-gray-500 dark:text-gray-400">Notes</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{d.notes}</p>
                </div>
              )}
            </div>
            {d.status_history.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Historique des statuts</p>
                <div className="space-y-1">
                  {d.status_history.map((h) => (
                    <div key={h.id} className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                      <span className="whitespace-nowrap">{new Date(h.created_at).toLocaleString('fr-FR')}</span>
                      <span>{STATUS_LABELS[h.from_status as DeliveryStatus] ?? h.from_status}</span>
                      <span>→</span>
                      <span className="font-medium">{STATUS_LABELS[h.to_status as DeliveryStatus] ?? h.to_status}</span>
                      {h.reason && <span className="text-gray-400">({h.reason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Create modal */}
      {/* Notify agent modal */}
      {notifyTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !notifyMutation.isPending && setNotifyTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-blue-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notifier le livreur</h2>
                </div>
                <button onClick={() => setNotifyTarget(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={notifyMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Agent : <span className="font-medium text-gray-900 dark:text-gray-100">{notifyTarget.agent_name}</span>
                  {' — '}{notifyTarget.recipient_name}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Canal</label>
                  <div className="flex gap-3">
                    {(['SMS', 'WHATSAPP'] as const).map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="channel" value={c} checked={notifyChannel === c} onChange={() => setNotifyChannel(c)} />
                        {c === 'SMS' ? 'SMS' : 'WhatsApp'}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Message</label>
                  <textarea
                    rows={4}
                    value={notifyMessage}
                    onChange={(e) => setNotifyMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setNotifyTarget(null)} disabled={notifyMutation.isPending}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                  </button>
                  <button
                    onClick={() => notifyTarget && notifyMutation.mutate(notifyTarget)}
                    disabled={notifyMutation.isPending || !notifyMessage.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Bell size={14} />
                    {notifyMutation.isPending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Escalate modal */}
      {escalateTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !escalateMutation.isPending && setEscalateTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-orange-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Signaler un retard</h2>
                </div>
                <button onClick={() => setEscalateTarget(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={escalateMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Livraison #{escalateTarget.confirmation_code} — <span className="font-medium text-gray-900 dark:text-gray-100">{escalateTarget.recipient_name}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Raison / Commentaire</label>
                  <textarea
                    rows={3}
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    placeholder="Livraison en retard — action requise..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEscalateTarget(null)} disabled={escalateMutation.isPending}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                  </button>
                  <button
                    onClick={() => escalateTarget && escalateMutation.mutate(escalateTarget)}
                    disabled={escalateMutation.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-60"
                  >
                    <AlertTriangle size={14} />
                    {escalateMutation.isPending ? 'Envoi...' : 'Signaler le retard'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pickup confirmation modal */}
      {pickupTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !confirmPickupMut.isPending && setPickupTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <KeyRound size={18} className="text-violet-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmer la recuperation</h2>
                </div>
                <button onClick={() => setPickupTarget(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={confirmPickupMut.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Livraison #{pickupTarget.confirmation_code} —{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{pickupTarget.recipient_name}</span>
                </div>
                {pickupTarget.sale_items_summary?.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Articles a recuperer :</p>
                    <ul className="space-y-1">
                      {pickupTarget.sale_items_summary.map((item, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-900 dark:text-gray-100">{item.name}</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Code de recuperation
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pickupCode}
                    onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 chiffres"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 font-mono tracking-widest text-center text-lg"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setPickupTarget(null)} disabled={confirmPickupMut.isPending}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                  </button>
                  <button
                    onClick={() => confirmPickupMut.mutate({ id: pickupTarget.id, code: pickupCode })}
                    disabled={confirmPickupMut.isPending || pickupCode.length !== 6}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
                  >
                    <KeyRound size={14} />
                    {confirmPickupMut.isPending ? 'Verification...' : 'Confirmer recuperation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {openCreate && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !createMutation.isPending && setOpenCreate(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nouvelle livraison</h2>
                <button onClick={() => setOpenCreate(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={createMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Vente liee (optionnel)</label>
                    {formSaleId ? (
                      <div className="flex items-center gap-2 px-3 py-2 border border-primary rounded-lg text-sm bg-primary/5 dark:bg-primary/10">
                        <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">{formSaleLabel}</span>
                        <button type="button" onClick={() => { setFormSaleId(''); setFormSaleLabel(''); setFormSaleSearch(''); }} className="text-gray-400 hover:text-gray-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={formSaleSearch}
                          onChange={(e) => { setFormSaleSearch(e.target.value); setShowSaleDropdown(true); }}
                          onFocus={() => setShowSaleDropdown(true)}
                          placeholder="Rechercher par n° facture ou client..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                        />
                        {showSaleDropdown && saleSearchData && saleSearchData.results.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-auto">
                            {saleSearchData.results.map((s: Sale) => (
                              <button
                                key={s.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => {
                                  setFormSaleId(s.id);
                                  setFormSaleLabel(`${s.invoice_number} — ${s.customer_name ?? 'Client inconnu'}`);
                                  if (s.customer_name && !formRecipient) setFormRecipient(s.customer_name);
                                  setFormSaleSearch('');
                                  setShowSaleDropdown(false);
                                }}
                              >
                                <span className="font-medium">{s.invoice_number}</span>
                                {s.customer_name && <span className="text-gray-500 ml-2">{s.customer_name}</span>}
                                <span className="text-gray-400 ml-2">{formatCurrency(s.total)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Destinataire *</label>
                    <input type="text" value={formRecipient} onChange={(e) => setFormRecipient(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Telephone *</label>
                    <input type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Zone</label>
                    <select value={formZone} onChange={(e) => {
                      setFormZone(e.target.value);
                      const zone = zonesData?.results.find((z) => z.id === e.target.value);
                      if (zone) setFormPayoutAmount(zone.fee);
                    }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100">
                      <option value="">Selectionner...</option>
                      {zonesData?.results.map((z) => (
                        <option key={z.id} value={z.id}>{z.name} ({formatCurrency(z.fee)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Montant remis au livreur (FCFA)</label>
                    <input type="number" min="0" value={formPayoutAmount} onChange={(e) => setFormPayoutAmount(e.target.value)}
                      placeholder="Auto depuis zone"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Agent</label>
                    <select value={formAgent} onChange={(e) => setFormAgent(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100">
                      <option value="">Selectionner...</option>
                      {agentsData?.results.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({VEHICLE_LABELS[a.vehicle_type]})</option>
                      ))}
                    </select>
                    {!formAgent && (
                      <p className="mt-1 text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Radio size={10} />
                        Sera diffusee a tous les livreurs actifs
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Emplacement colis</label>
                    <select value={formPickupLocation} onChange={(e) => setFormPickupLocation(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100">
                      <option value="">Aucun emplacement defini</option>
                      {pickupLocationsData?.results.map((loc: DeliveryPickupLocation) => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Adresse de livraison *</label>
                    <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Precisions emplacement colis</label>
                    <input type="text" value={formPickupNotes} onChange={(e) => setFormPickupNotes(e.target.value)}
                      placeholder="Ex: Rayon 3, palette rouge..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
                    <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !formRecipient.trim() || !formPhone.trim() || !formAddress.trim()}
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {createMutation.isPending ? 'Creation...' : 'Creer la livraison'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Available Tab (broadcast deliveries — DELIVERY role agents)
// ---------------------------------------------------------------------------

function AvailableTab({ storeId: _storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDeliveryRole = user?.role === 'DELIVERY';

  const { data: deliveries, isLoading } = useQuery({
    queryKey: queryKeys.delivery.deliveries.available,
    queryFn: () => deliveryApi.deliveries.available(),
    refetchInterval: 30000,
  });

  const claimMutation = useMutation({
    mutationFn: (id: string) => deliveryApi.deliveries.claim(id),
    onSuccess: () => {
      toast.success('Livraison prise en charge !');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.available });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur lors de la prise en charge')),
  });

  const [pickupTarget, setPickupTarget] = useState<Delivery | null>(null);
  const [pickupCode, setPickupCode] = useState('');

  const confirmPickupMut = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      deliveryApi.deliveries.confirmPickup(id, { code }),
    onSuccess: () => {
      toast.success('Recuperation confirmee — livraison en cours');
      setPickupTarget(null);
      setPickupCode('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.deliveries.available });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Code invalide ou erreur')),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!deliveries || deliveries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-12 text-center">
        <Radio size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">Aucune livraison disponible pour le moment.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Actualisation automatique toutes les 30 secondes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {deliveries.length} livraison(s) en attente d'un livreur.
        {' '}Actualisation automatique toutes les 30 secondes.
      </p>
      {deliveries.map((d) => (
        <div key={d.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Destinataire</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{d.recipient_name}</p>
                <p className="text-gray-600 dark:text-gray-400">{d.recipient_phone}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Adresse de livraison</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.delivery_address}</p>
                {d.zone_name && <p className="text-xs text-gray-500">Zone : {d.zone_name}</p>}
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Recuperation colis</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {d.pickup_location_name ?? 'Non specifie'}
                </p>
                {d.pickup_notes && <p className="text-xs text-gray-500">{d.pickup_notes}</p>}
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Montant</p>
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {d.payout_amount ? formatCurrency(d.payout_amount) : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Code confirmation</p>
                <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{d.confirmation_code}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Publiee par</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{d.seller_name ?? '-'}</p>
                <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString('fr-FR')}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isDeliveryRole && (
                <button
                  onClick={() => claimMutation.mutate(d.id)}
                  disabled={claimMutation.isPending}
                  className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                >
                  <UserCheck size={16} />
                  Prendre en charge
                </button>
              )}
              {d.status === 'READY' && (
                <button
                  onClick={() => { setPickupTarget(d); setPickupCode(''); }}
                  className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
                >
                  <KeyRound size={16} />
                  Confirmer recuperation
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Pickup confirmation modal */}
      {pickupTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !confirmPickupMut.isPending && setPickupTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <KeyRound size={18} className="text-violet-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmer la recuperation</h2>
                </div>
                <button onClick={() => setPickupTarget(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={confirmPickupMut.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Livraison #{pickupTarget.confirmation_code} —{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{pickupTarget.recipient_name}</span>
                </p>
                {pickupTarget.sale_items_summary?.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Articles a recuperer :</p>
                    <ul className="space-y-1">
                      {pickupTarget.sale_items_summary.map((item, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-900 dark:text-gray-100">{item.name}</span>
                          <span className="font-medium">× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Code de recuperation</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pickupCode}
                    onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 chiffres"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 font-mono tracking-widest text-center text-lg"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setPickupTarget(null)} disabled={confirmPickupMut.isPending}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                  </button>
                  <button
                    onClick={() => confirmPickupMut.mutate({ id: pickupTarget.id, code: pickupCode })}
                    disabled={confirmPickupMut.isPending || pickupCode.length !== 6}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
                  >
                    <KeyRound size={14} />
                    {confirmPickupMut.isPending ? 'Verification...' : 'Confirmer recuperation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zones Tab
// ---------------------------------------------------------------------------

function ZonesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFee, setFormFee] = useState('');
  const [formMinutes, setFormMinutes] = useState('');
  const [formActive, setFormActive] = useState(true);

  const params: Record<string, string> = { store: storeId, page: String(page), page_size: String(PAGE_SIZE) };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.delivery.zones.list(params),
    queryFn: () => deliveryApi.zones.list(params),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Partial<DeliveryZone> = {
        store: storeId,
        name: formName.trim(),
        description: formDescription.trim(),
        fee: formFee,
        estimated_minutes: formMinutes ? Number(formMinutes) : null,
        is_active: formActive,
      };
      return editingZone
        ? deliveryApi.zones.update(editingZone.id, payload)
        : deliveryApi.zones.create(payload);
    },
    onSuccess: () => {
      toast.success(editingZone ? 'Zone mise a jour' : 'Zone creee');
      closeModal();
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.zones.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deliveryApi.zones.delete(id),
    onSuccess: () => {
      toast.success('Zone supprimee');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.zones.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  function openCreateModal() {
    setEditingZone(null);
    setFormName('');
    setFormDescription('');
    setFormFee('');
    setFormMinutes('');
    setFormActive(true);
    setOpenModal(true);
  }

  function openEditModal(zone: DeliveryZone) {
    setEditingZone(zone);
    setFormName(zone.name);
    setFormDescription(zone.description);
    setFormFee(zone.fee);
    setFormMinutes(zone.estimated_minutes ? String(zone.estimated_minutes) : '');
    setFormActive(zone.is_active);
    setOpenModal(true);
  }

  function closeModal() {
    setOpenModal(false);
    setEditingZone(null);
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{data?.count ?? 0} zone(s)</span>
        <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={16} />
          Nouvelle zone
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Description</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Frais</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Temps estime (min)</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actif</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((zone) => (
                <tr key={zone.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{zone.name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{zone.description || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(zone.fee)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{zone.estimated_minutes ?? '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${zone.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {zone.is_active ? 'Oui' : 'Non'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditModal(zone)} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                        Modifier
                      </button>
                      <button
                        onClick={() => { if (confirm('Supprimer cette zone ?')) deleteMutation.mutate(zone.id); }}
                        className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucune zone de livraison.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {openModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saveMutation.isPending && closeModal()} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingZone ? 'Modifier la zone' : 'Nouvelle zone'}
                </h2>
                <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={saveMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nom *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description</label>
                  <textarea rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Frais de livraison *</label>
                    <input type="number" min="0" step="1" value={formFee} onChange={(e) => setFormFee(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Temps estime (min)</label>
                    <input type="number" min="0" value={formMinutes} onChange={(e) => setFormMinutes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-gray-300" />
                  Zone active
                </label>
                <div className="flex justify-end">
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !formName.trim() || !formFee}
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agents Tab
// ---------------------------------------------------------------------------

function AgentsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<DeliveryAgent | null>(null);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formVehicle, setFormVehicle] = useState<string>('MOTO');
  const [formActive, setFormActive] = useState(true);

  const params: Record<string, string> = { store: storeId, page: String(page), page_size: String(PAGE_SIZE) };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.delivery.agents.list(params),
    queryFn: () => deliveryApi.agents.list(params),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Partial<DeliveryAgent> = {
        store: storeId,
        name: formName.trim(),
        phone: formPhone.trim(),
        vehicle_type: formVehicle as DeliveryAgent['vehicle_type'],
        is_active: formActive,
      };
      return editingAgent
        ? deliveryApi.agents.update(editingAgent.id, payload)
        : deliveryApi.agents.create(payload);
    },
    onSuccess: () => {
      toast.success(editingAgent ? 'Agent mis a jour' : 'Agent cree');
      closeModal();
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agents.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deliveryApi.agents.delete(id),
    onSuccess: () => {
      toast.success('Agent supprime');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agents.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  function openCreateModal() {
    setEditingAgent(null);
    setFormName('');
    setFormPhone('');
    setFormVehicle('MOTO');
    setFormActive(true);
    setOpenModal(true);
  }

  function openEditModal(agent: DeliveryAgent) {
    setEditingAgent(agent);
    setFormName(agent.name);
    setFormPhone(agent.phone);
    setFormVehicle(agent.vehicle_type);
    setFormActive(agent.is_active);
    setOpenModal(true);
  }

  function closeModal() {
    setOpenModal(false);
    setEditingAgent(null);
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{data?.count ?? 0} agent(s)</span>
        <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={16} />
          Nouvel agent
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Telephone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vehicule</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actif</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((agent) => (
                <tr key={agent.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{agent.name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{agent.phone}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{VEHICLE_LABELS[agent.vehicle_type] ?? agent.vehicle_type}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${agent.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {agent.is_active ? 'Oui' : 'Non'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditModal(agent)} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                        Modifier
                      </button>
                      <button
                        onClick={() => { if (confirm('Supprimer cet agent ?')) deleteMutation.mutate(agent.id); }}
                        className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun agent de livraison.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {openModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saveMutation.isPending && closeModal()} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingAgent ? 'Modifier l\'agent' : 'Nouvel agent'}
                </h2>
                <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={saveMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nom *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Telephone *</label>
                  <input type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Type de vehicule *</label>
                  <select value={formVehicle} onChange={(e) => setFormVehicle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100">
                    <option value="MOTO">Moto</option>
                    <option value="VOITURE">Voiture</option>
                    <option value="VELO">Velo</option>
                    <option value="PIETON">Pieton</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-gray-300" />
                  Agent actif
                </label>
                <div className="flex justify-end">
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !formName.trim() || !formPhone.trim()}
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stats Tab
// ---------------------------------------------------------------------------

function StatsTab({ storeId: _storeId }: { storeId: string }) {
  const today = new Date();
  const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [period, setPeriod] = useState(defaultPeriod);

  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.delivery.agents.stats(period),
    queryFn: () => deliveryApi.agents.stats(period),
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Periode :</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !stats || stats.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            Aucune livraison pour cette periode.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-center px-3 py-3 font-medium text-gray-600 dark:text-gray-400 w-12">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vehicule</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Livrees</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Retournees</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">% Succes</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Objectif</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                const rowBg = idx === 0
                  ? 'bg-yellow-50/60 dark:bg-yellow-900/10'
                  : idx === 1
                  ? 'bg-gray-50/80 dark:bg-gray-700/20'
                  : idx === 2
                  ? 'bg-orange-50/50 dark:bg-orange-900/10'
                  : '';
                return (
                <tr key={row.agent_id} className={`border-b border-gray-50 dark:border-gray-700 ${rowBg}`}>
                  <td className="px-3 py-3 text-center">
                    {medal ? (
                      <span className="text-xl" title={`${idx + 1}ème`}>{medal}</span>
                    ) : (
                      <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">{idx + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    <div className={idx === 0 ? 'font-bold' : ''}>{row.agent_name}</div>
                    {row.agent_phone && <div className="text-xs text-gray-500">{row.agent_phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{VEHICLE_LABELS[row.vehicle_type] ?? row.vehicle_type}</td>
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.total}</td>
                  <td className="px-4 py-3 text-center font-semibold text-green-700 dark:text-green-400">{row.delivered}</td>
                  <td className="px-4 py-3 text-center text-red-600 dark:text-red-400">{row.returned}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`font-semibold ${row.success_rate >= 80 ? 'text-green-600 dark:text-green-400' : row.success_rate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                        {row.success_rate}%
                      </span>
                      <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.success_rate >= 80 ? 'bg-green-500' : row.success_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(row.success_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.objective ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-medium ${row.objective.achieved ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          {row.delivered}/{row.objective.target_count}
                          {row.objective.achieved && ' ✓'}
                        </span>
                        <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${row.objective.achieved ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(row.delivered / row.objective.target_count * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                    {parseFloat(row.bonus_earned) > 0 ? formatCurrency(row.bonus_earned) : '—'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Objectives Tab
// ---------------------------------------------------------------------------

function ObjectivesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const today = new Date();
  const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [openModal, setOpenModal] = useState(false);
  const [editingObj, setEditingObj] = useState<AgentObjective | null>(null);

  const [formAgent, setFormAgent] = useState('');
  const [formPeriod, setFormPeriod] = useState(defaultPeriod);
  const [formTarget, setFormTarget] = useState('');
  const [formBonus, setFormBonus] = useState('0');
  const [formNotes, setFormNotes] = useState('');

  const { data: objectives, isLoading } = useQuery({
    queryKey: queryKeys.delivery.agentObjectives.list(period),
    queryFn: () => agentObjectivesApi.list(period),
  });

  const { data: agentsData } = useQuery({
    queryKey: queryKeys.delivery.agents.list({ store: storeId, page_size: '200', is_active: 'true' }),
    queryFn: () => deliveryApi.agents.list({ store: storeId, page_size: '200', is_active: 'true' }),
  });

  const { data: statsData } = useQuery({
    queryKey: queryKeys.delivery.agents.stats(period),
    queryFn: () => deliveryApi.agents.stats(period),
  });

  const statsMap = useMemo(() => {
    const m = new Map<string, { delivered: number }>();
    statsData?.forEach((s) => m.set(s.agent_id, { delivered: s.delivered }));
    return m;
  }, [statsData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Partial<AgentObjective> = {
        agent: formAgent,
        period: formPeriod,
        target_count: Number(formTarget),
        bonus_amount: formBonus,
        notes: formNotes.trim(),
      };
      return editingObj
        ? agentObjectivesApi.update(editingObj.id, payload)
        : agentObjectivesApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editingObj ? 'Objectif mis a jour' : 'Objectif cree');
      closeModal();
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agentObjectives.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agents.stats(period) });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentObjectivesApi.delete(id),
    onSuccess: () => {
      toast.success('Objectif supprime');
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agentObjectives.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.agents.stats(period) });
    },
    onError: (err: unknown) => toast.error(extractApiError(err, 'Erreur')),
  });

  function openCreateModal() {
    setEditingObj(null);
    setFormAgent('');
    setFormPeriod(period);
    setFormTarget('');
    setFormBonus('0');
    setFormNotes('');
    setOpenModal(true);
  }

  function openEditModal(obj: AgentObjective) {
    setEditingObj(obj);
    setFormAgent(obj.agent);
    setFormPeriod(obj.period);
    setFormTarget(String(obj.target_count));
    setFormBonus(obj.bonus_amount);
    setFormNotes(obj.notes);
    setOpenModal(true);
  }

  function closeModal() {
    setOpenModal(false);
    setEditingObj(null);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Periode :</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
        />
        <button onClick={openCreateModal} className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={16} />
          Nouvel objectif
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !objectives || objectives.results.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            Aucun objectif pour cette periode.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Periode</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Objectif</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Progression</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Bonus</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {objectives.results.map((obj) => {
                const agentStats = statsMap.get(obj.agent);
                const delivered = agentStats?.delivered ?? 0;
                const achieved = delivered >= obj.target_count;
                const pct = obj.target_count > 0 ? Math.min(delivered / obj.target_count * 100, 100) : 0;
                return (
                  <tr key={obj.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{obj.agent_name}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{obj.period}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{obj.target_count} livraisons</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-semibold ${achieved ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            {delivered}/{obj.target_count}
                          </span>
                          {achieved && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs font-medium">
                              <CheckCircle size={10} /> Atteint
                            </span>
                          )}
                        </div>
                        <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${achieved ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(obj.bonus_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(obj)} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                          Modifier
                        </button>
                        <button
                          onClick={() => { if (confirm('Supprimer cet objectif ?')) deleteMutation.mutate(obj.id); }}
                          className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saveMutation.isPending && closeModal()} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingObj ? 'Modifier l\'objectif' : 'Nouvel objectif livreur'}
                </h2>
                <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" disabled={saveMutation.isPending}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Agent *</label>
                  <select value={formAgent} onChange={(e) => setFormAgent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    disabled={!!editingObj}>
                    <option value="">Selectionner un agent...</option>
                    {agentsData?.results.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({VEHICLE_LABELS[a.vehicle_type]})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Periode *</label>
                  <input type="month" value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
                    disabled={!!editingObj} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Objectif (nb livraisons) *</label>
                    <input type="number" min="1" value={formTarget} onChange={(e) => setFormTarget(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bonus FCFA si atteint</label>
                    <input type="number" min="0" step="500" value={formBonus} onChange={(e) => setFormBonus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
                  <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !formAgent || !formPeriod || !formTarget}
                    className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DeliveryListPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const user = useAuthStore((s) => s.user);
  const isDeliveryRole = user?.role === 'DELIVERY';

  const [activeTab, setActiveTab] = useState<Tab>(isDeliveryRole ? 'available' : 'deliveries');

  const { data: availableDeliveries } = useQuery({
    queryKey: queryKeys.delivery.deliveries.available,
    queryFn: () => deliveryApi.deliveries.available(),
    refetchInterval: 30000,
    enabled: !!currentStore,
  });
  const availableCount = availableDeliveries?.length ?? 0;

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  const allTabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number; deliveryOnly?: boolean; hideForDelivery?: boolean }[] = [
    { key: 'deliveries', label: 'Livraisons', icon: <Truck size={18} />, hideForDelivery: false },
    { key: 'available', label: 'Disponibles', icon: <Radio size={18} />, badge: availableCount },
    { key: 'zones', label: 'Zones', icon: <MapPin size={18} />, hideForDelivery: true },
    { key: 'agents', label: 'Agents', icon: <Users size={18} />, hideForDelivery: true },
    { key: 'stats', label: 'Statistiques', icon: <BarChart2 size={18} />, hideForDelivery: true },
    { key: 'objectives', label: 'Objectifs', icon: <Target size={18} />, hideForDelivery: true },
  ];

  const tabs = allTabs.filter((t) => !(isDeliveryRole && t.hideForDelivery));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Package size={24} />
          Livraison & Logistique
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boutique: {currentStore.name}</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'deliveries' && <DeliveriesTab storeId={currentStore.id} />}
      {activeTab === 'available' && <AvailableTab storeId={currentStore.id} />}
      {activeTab === 'zones' && <ZonesTab storeId={currentStore.id} />}
      {activeTab === 'agents' && <AgentsTab storeId={currentStore.id} />}
      {activeTab === 'stats' && <StatsTab storeId={currentStore.id} />}
      {activeTab === 'objectives' && <ObjectivesTab storeId={currentStore.id} />}
    </div>
  );
}
