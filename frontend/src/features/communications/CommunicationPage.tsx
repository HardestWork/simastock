/** Communication Client — modeles, historique de messages et campagnes. */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStoreStore } from '@/store-context/store-store';
import { communicationApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import { useDebounce } from '@/hooks/use-debounce';
import Pagination from '@/components/shared/Pagination';
import { MessageSquare, Mail, Send, Plus, Search, X, Eye, Play, Ban, Clock } from 'lucide-react';
import type {
  MessageTemplate,
  Campaign,
  MessageChannel,
  CampaignStatus,
} from '@/api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type CommunicationTab = 'modeles' | 'historique' | 'campagnes';

const PAGE_SIZE = 20;

const CHANNEL_OPTIONS: { value: MessageChannel; label: string }[] = [
  { value: 'SMS', label: 'SMS' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
];

const TRIGGER_EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'MANUAL', label: 'Manuel' },
  { value: 'SALE_COMPLETED', label: 'Vente terminee' },
  { value: 'PAYMENT_RECEIVED', label: 'Paiement recu' },
  { value: 'CREDIT_DUE', label: 'Echeance credit' },
  { value: 'DELIVERY_STATUS', label: 'Statut livraison' },
];

const MESSAGE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'SENT', label: 'Envoye' },
  { value: 'DELIVERED', label: 'Livre' },
  { value: 'FAILED', label: 'Echoue' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateValue?: string | null): string {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function channelBadge(channel: MessageChannel) {
  const map: Record<MessageChannel, string> = {
    SMS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    WHATSAPP: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    EMAIL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${map[channel]}`}>
      {channel === 'EMAIL' ? <Mail size={12} /> : <MessageSquare size={12} />}
      {channel === 'WHATSAPP' ? 'WhatsApp' : channel}
    </span>
  );
}

function messageStatusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  const labels: Record<string, string> = {
    PENDING: 'En attente',
    SENT: 'Envoye',
    DELIVERED: 'Livre',
    FAILED: 'Echoue',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function campaignStatusBadge(status: CampaignStatus) {
  const map: Record<CampaignStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    SENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  const labels: Record<CampaignStatus, string> = {
    DRAFT: 'Brouillon',
    SCHEDULED: 'Planifiee',
    SENDING: 'En cours',
    COMPLETED: 'Terminee',
    CANCELLED: 'Annulee',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

function Modal({ open, title, onClose, children, wide }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className={`relative z-10 w-full ${wide ? 'max-w-2xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl`}>
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state types
// ---------------------------------------------------------------------------

interface TemplateFormState {
  name: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  trigger_event: string;
  is_active: boolean;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: '',
  channel: 'SMS',
  subject: '',
  body: '',
  trigger_event: 'MANUAL',
  is_active: true,
};

interface CampaignFormState {
  name: string;
  channel: MessageChannel;
  template: string;
  min_purchases: string;
  inactive_days: string;
  has_email: boolean;
  has_phone: boolean;
  scheduled_at: string;
}

const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
  name: '',
  channel: 'SMS',
  template: '',
  min_purchases: '',
  inactive_days: '',
  has_email: false,
  has_phone: false,
  scheduled_at: '',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CommunicationPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<CommunicationTab>('modeles');

  // ---- Template tab state ----
  const [templatePage, setTemplatePage] = useState(1);
  const [templateSearch, setTemplateSearch] = useState('');
  const debouncedTemplateSearch = useDebounce(templateSearch, 300);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);

  // ---- Log tab state ----
  const [logPage, setLogPage] = useState(1);
  const [logChannelFilter, setLogChannelFilter] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ---- Campaign tab state ----
  const [campaignPage, setCampaignPage] = useState(1);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);

  const storeId = currentStore?.id ?? '';

  // Reset pages when filters change
  useEffect(() => { setTemplatePage(1); }, [debouncedTemplateSearch]);
  useEffect(() => { setLogPage(1); }, [logChannelFilter, logStatusFilter]);

  // ========================================================================
  // QUERIES
  // ========================================================================

  // --- Templates ---
  const templateParams = useMemo(() => {
    const p: Record<string, string> = {
      page: String(templatePage),
      page_size: String(PAGE_SIZE),
      ordering: '-created_at',
    };
    if (debouncedTemplateSearch) p.search = debouncedTemplateSearch;
    return p;
  }, [templatePage, debouncedTemplateSearch]);

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: queryKeys.communications.templates.list(templateParams),
    queryFn: () => communicationApi.templates.list(templateParams),
    enabled: tab === 'modeles',
  });

  const templateTotalPages = templatesData ? Math.ceil(templatesData.count / PAGE_SIZE) : 0;

  // --- Logs ---
  const logParams = useMemo(() => {
    const p: Record<string, string> = {
      store: storeId,
      page: String(logPage),
      page_size: String(PAGE_SIZE),
      ordering: '-created_at',
    };
    if (logChannelFilter) p.channel = logChannelFilter;
    if (logStatusFilter) p.status = logStatusFilter;
    return p;
  }, [storeId, logPage, logChannelFilter, logStatusFilter]);

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: queryKeys.communications.logs.list(logParams),
    queryFn: () => communicationApi.logs.list(logParams),
    enabled: !!storeId && tab === 'historique',
  });

  const logTotalPages = logsData ? Math.ceil(logsData.count / PAGE_SIZE) : 0;

  // --- Campaigns ---
  const campaignParams = useMemo(() => {
    const p: Record<string, string> = {
      store: storeId,
      page: String(campaignPage),
      page_size: String(PAGE_SIZE),
      ordering: '-created_at',
    };
    return p;
  }, [storeId, campaignPage]);

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: queryKeys.communications.campaigns.list(campaignParams),
    queryFn: () => communicationApi.campaigns.list(campaignParams),
    enabled: !!storeId && tab === 'campagnes',
  });

  const campaignTotalPages = campaignsData ? Math.ceil(campaignsData.count / PAGE_SIZE) : 0;

  // Templates lookup for campaign create
  const { data: allTemplatesData } = useQuery({
    queryKey: queryKeys.communications.templates.list({ page_size: '200' }),
    queryFn: () => communicationApi.templates.list({ page_size: '200', is_active: 'true' }),
    enabled: showCampaignModal,
  });

  // Campaign preview
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: queryKeys.communications.campaigns.preview(previewCampaignId ?? ''),
    queryFn: () => communicationApi.campaigns.preview(previewCampaignId!),
    enabled: !!previewCampaignId,
  });

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  // --- Template CRUD ---
  const createTemplateMut = useMutation({
    mutationFn: (data: Partial<MessageTemplate>) => communicationApi.templates.create(data),
    onSuccess: () => {
      toast.success('Modele cree avec succes.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.templates.all });
      closeTemplateModal();
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const updateTemplateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MessageTemplate> }) =>
      communicationApi.templates.update(id, data),
    onSuccess: () => {
      toast.success('Modele mis a jour.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.templates.all });
      closeTemplateModal();
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: (id: string) => communicationApi.templates.delete(id),
    onSuccess: () => {
      toast.success('Modele supprime.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.templates.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  // --- Campaign mutations ---
  const createCampaignMut = useMutation({
    mutationFn: (data: Partial<Campaign>) => communicationApi.campaigns.create(data),
    onSuccess: () => {
      toast.success('Campagne creee avec succes.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.campaigns.all });
      closeCampaignModal();
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const launchCampaignMut = useMutation({
    mutationFn: (id: string) => communicationApi.campaigns.launch(id),
    onSuccess: () => {
      toast.success('Campagne lancee.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.campaigns.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const cancelCampaignMut = useMutation({
    mutationFn: (id: string) => communicationApi.campaigns.cancel(id),
    onSuccess: () => {
      toast.success('Campagne annulee.');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.campaigns.all });
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  // ========================================================================
  // HANDLERS
  // ========================================================================

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setShowTemplateModal(true);
  }

  function openEditTemplate(t: MessageTemplate) {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      trigger_event: t.trigger_event,
      is_active: t.is_active,
    });
    setShowTemplateModal(true);
  }

  function closeTemplateModal() {
    setShowTemplateModal(false);
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
  }

  function handleTemplateSave() {
    const payload: Partial<MessageTemplate> = {
      name: templateForm.name.trim(),
      channel: templateForm.channel,
      subject: templateForm.subject.trim(),
      body: templateForm.body,
      trigger_event: templateForm.trigger_event as MessageTemplate['trigger_event'],
      is_active: templateForm.is_active,
    };
    if (editingTemplate) {
      updateTemplateMut.mutate({ id: editingTemplate.id, data: payload });
    } else {
      createTemplateMut.mutate(payload);
    }
  }

  function closeCampaignModal() {
    setShowCampaignModal(false);
    setCampaignForm(EMPTY_CAMPAIGN_FORM);
  }

  function handleCampaignSave() {
    const segmentFilter: Record<string, unknown> = {};
    if (campaignForm.min_purchases) segmentFilter.min_purchases = parseInt(campaignForm.min_purchases, 10);
    if (campaignForm.inactive_days) segmentFilter.inactive_days = parseInt(campaignForm.inactive_days, 10);
    if (campaignForm.has_email) segmentFilter.has_email = true;
    if (campaignForm.has_phone) segmentFilter.has_phone = true;

    const payload: Partial<Campaign> = {
      store: storeId || undefined,
      name: campaignForm.name.trim(),
      channel: campaignForm.channel,
      template: campaignForm.template,
      segment_filter: segmentFilter,
      scheduled_at: campaignForm.scheduled_at || null,
    };
    createCampaignMut.mutate(payload);
  }

  // ========================================================================
  // SHARED STYLES
  // ========================================================================

  const inputCls =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const selectCls =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const btnPrimary =
    'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const btnDanger =
    'inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const thCls =
    'px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider';
  const tdCls = 'px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  // ========================================================================
  // RENDER: TABS
  // ========================================================================

  const tabs: { key: CommunicationTab; label: string; icon: React.ReactNode }[] = [
    { key: 'modeles', label: 'Modeles', icon: <MessageSquare size={16} /> },
    { key: 'historique', label: 'Historique', icon: <Clock size={16} /> },
    { key: 'campagnes', label: 'Campagnes', icon: <Send size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Communication Client</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gerez vos modeles de messages, l'historique d'envoi et les campagnes.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4" aria-label="Tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'modeles' && renderTemplatesTab()}
      {tab === 'historique' && renderLogsTab()}
      {tab === 'campagnes' && renderCampaignsTab()}

      {/* Modals */}
      {renderTemplateModal()}
      {renderCampaignCreateModal()}
      {renderCampaignPreviewModal()}
    </div>
  );

  // ========================================================================
  // TAB 1: Modeles
  // ========================================================================

  function renderTemplatesTab() {
    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un modele..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
          <button type="button" onClick={openCreateTemplate} className={btnPrimary}>
            <Plus size={16} />
            Nouveau modele
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className={thCls}>Nom</th>
                <th className={thCls}>Canal</th>
                <th className={thCls}>Declencheur</th>
                <th className={thCls}>Actif</th>
                <th className={thCls}>Date</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {templatesLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Chargement...
                  </td>
                </tr>
              ) : !templatesData?.results?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Aucun modele trouve.
                  </td>
                </tr>
              ) : (
                templatesData.results.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className={tdCls}>
                      <span className="font-medium">{t.name}</span>
                    </td>
                    <td className={tdCls}>{channelBadge(t.channel)}</td>
                    <td className={tdCls}>
                      <span className="text-gray-600 dark:text-gray-400">
                        {TRIGGER_EVENT_OPTIONS.find((o) => o.value === t.trigger_event)?.label ?? t.trigger_event}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          t.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {t.is_active ? 'Oui' : 'Non'}
                      </span>
                    </td>
                    <td className={tdCls}>{formatDate(t.created_at)}</td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditTemplate(t)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Supprimer ce modele ?')) deleteTemplateMut.mutate(t.id);
                          }}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={templatePage} totalPages={templateTotalPages} onPageChange={setTemplatePage} />
      </div>
    );
  }

  // ========================================================================
  // TAB 2: Historique
  // ========================================================================

  function renderLogsTab() {
    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={logChannelFilter}
            onChange={(e) => setLogChannelFilter(e.target.value)}
            className={`${selectCls} max-w-[180px]`}
          >
            <option value="">Tous les canaux</option>
            {CHANNEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={logStatusFilter}
            onChange={(e) => setLogStatusFilter(e.target.value)}
            className={`${selectCls} max-w-[180px]`}
          >
            {MESSAGE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className={thCls}>Client</th>
                <th className={thCls}>Canal</th>
                <th className={thCls}>Destinataire</th>
                <th className={thCls}>Statut</th>
                <th className={thCls}>Modele</th>
                <th className={thCls}>Envoye le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logsLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Chargement...
                  </td>
                </tr>
              ) : !logsData?.results?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Aucun message trouve.
                  </td>
                </tr>
              ) : (
                logsData.results.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  >
                    <td className={tdCls}>{log.customer_name ?? '-'}</td>
                    <td className={tdCls}>{channelBadge(log.channel)}</td>
                    <td className={tdCls}>
                      <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{log.recipient_contact}</span>
                    </td>
                    <td className={tdCls}>{messageStatusBadge(log.status)}</td>
                    <td className={tdCls}>
                      <span className="text-gray-600 dark:text-gray-400">{log.template_name ?? '-'}</span>
                    </td>
                    <td className={tdCls}>{formatDate(log.sent_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Expanded row detail */}
          {expandedLogId && logsData?.results && (() => {
            const log = logsData.results.find((l) => l.id === expandedLogId);
            if (!log) return null;
            return (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-6 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Contenu du message</h4>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedLogId(null); }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X size={14} />
                  </button>
                </div>
                {log.subject && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span className="font-medium">Objet :</span> {log.subject}
                  </p>
                )}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {log.body_rendered || '(Aucun contenu)'}
                </div>
                {log.error_message && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    <span className="font-medium">Erreur :</span> {log.error_message}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <Pagination page={logPage} totalPages={logTotalPages} onPageChange={setLogPage} />
      </div>
    );
  }

  // ========================================================================
  // TAB 3: Campagnes
  // ========================================================================

  function renderCampaignsTab() {
    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => { setCampaignForm(EMPTY_CAMPAIGN_FORM); setShowCampaignModal(true); }}
            className={btnPrimary}
          >
            <Plus size={16} />
            Nouvelle campagne
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className={thCls}>Nom</th>
                <th className={thCls}>Canal</th>
                <th className={thCls}>Modele</th>
                <th className={thCls}>Statut</th>
                <th className={thCls}>Destinataires</th>
                <th className={thCls}>Envoyes</th>
                <th className={thCls}>Echoues</th>
                <th className={thCls}>Planifiee</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {campaignsLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Chargement...
                  </td>
                </tr>
              ) : !campaignsData?.results?.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Aucune campagne trouvee.
                  </td>
                </tr>
              ) : (
                campaignsData.results.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className={tdCls}>
                      <span className="font-medium">{c.name}</span>
                    </td>
                    <td className={tdCls}>{channelBadge(c.channel)}</td>
                    <td className={tdCls}>
                      <span className="text-gray-600 dark:text-gray-400">{c.template_name ?? '-'}</span>
                    </td>
                    <td className={tdCls}>{campaignStatusBadge(c.status)}</td>
                    <td className={tdCls}>{c.total_recipients}</td>
                    <td className={tdCls}>
                      <span className="text-green-600 dark:text-green-400 font-medium">{c.sent_count}</span>
                    </td>
                    <td className={tdCls}>
                      <span className={c.failed_count > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                        {c.failed_count}
                      </span>
                    </td>
                    <td className={tdCls}>{formatDate(c.scheduled_at)}</td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewCampaignId(c.id)}
                          className={btnSecondary + ' !px-2 !py-1.5'}
                          title="Apercu"
                        >
                          <Eye size={14} />
                        </button>
                        {c.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Lancer cette campagne ?')) launchCampaignMut.mutate(c.id);
                            }}
                            disabled={launchCampaignMut.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                            title="Lancer"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Annuler cette campagne ?')) cancelCampaignMut.mutate(c.id);
                            }}
                            disabled={cancelCampaignMut.isPending}
                            className={btnDanger + ' !px-2 !py-1.5'}
                            title="Annuler"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={campaignPage} totalPages={campaignTotalPages} onPageChange={setCampaignPage} />
      </div>
    );
  }

  // ========================================================================
  // MODAL: Template Create / Edit
  // ========================================================================

  function renderTemplateModal() {
    const saving = createTemplateMut.isPending || updateTemplateMut.isPending;
    return (
      <Modal
        open={showTemplateModal}
        title={editingTemplate ? 'Modifier le modele' : 'Nouveau modele'}
        onClose={closeTemplateModal}
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Nom</label>
            <input
              type="text"
              value={templateForm.name}
              onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Confirmation de vente"
            />
          </div>

          {/* Channel */}
          <div>
            <label className={labelCls}>Canal</label>
            <select
              value={templateForm.channel}
              onChange={(e) => setTemplateForm((f) => ({ ...f, channel: e.target.value as MessageChannel }))}
              className={selectCls}
            >
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Subject (email only) */}
          {templateForm.channel === 'EMAIL' && (
            <div>
              <label className={labelCls}>Objet</label>
              <input
                type="text"
                value={templateForm.subject}
                onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))}
                className={inputCls}
                placeholder="Objet de l'email"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className={labelCls}>Corps du message</label>
            <textarea
              rows={5}
              value={templateForm.body}
              onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
              className={inputCls}
              placeholder="Bonjour {{client_name}}, votre commande #{{sale_ref}} a ete confirmee. Montant: {{total}} FCFA. Merci pour votre achat !"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Variables disponibles : {'{{client_name}}'}, {'{{sale_ref}}'}, {'{{total}}'}, {'{{store_name}}'}, {'{{date}}'}
            </p>
          </div>

          {/* Trigger event */}
          <div>
            <label className={labelCls}>Declencheur</label>
            <select
              value={templateForm.trigger_event}
              onChange={(e) => setTemplateForm((f) => ({ ...f, trigger_event: e.target.value }))}
              className={selectCls}
            >
              {TRIGGER_EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* is_active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={templateForm.is_active}
              onClick={() => setTemplateForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                templateForm.is_active ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  templateForm.is_active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {templateForm.is_active ? 'Actif' : 'Inactif'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={closeTemplateModal} className={btnSecondary}>
              Annuler
            </button>
            <button
              type="button"
              onClick={handleTemplateSave}
              disabled={saving || !templateForm.name.trim() || !templateForm.body.trim()}
              className={btnPrimary}
            >
              {saving ? 'Enregistrement...' : editingTemplate ? 'Mettre a jour' : 'Creer'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ========================================================================
  // MODAL: Campaign Create
  // ========================================================================

  function renderCampaignCreateModal() {
    const saving = createCampaignMut.isPending;
    const filteredTemplates = allTemplatesData?.results?.filter(
      (t) => t.channel === campaignForm.channel && t.is_active,
    ) ?? [];

    return (
      <Modal
        open={showCampaignModal}
        title="Nouvelle campagne"
        onClose={closeCampaignModal}
        wide
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Nom de la campagne</label>
            <input
              type="text"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Promo Noel 2026"
            />
          </div>

          {/* Channel */}
          <div>
            <label className={labelCls}>Canal</label>
            <select
              value={campaignForm.channel}
              onChange={(e) => setCampaignForm((f) => ({ ...f, channel: e.target.value as MessageChannel, template: '' }))}
              className={selectCls}
            >
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Template */}
          <div>
            <label className={labelCls}>Modele de message</label>
            <select
              value={campaignForm.template}
              onChange={(e) => setCampaignForm((f) => ({ ...f, template: e.target.value }))}
              className={selectCls}
            >
              <option value="">-- Selectionner un modele --</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {filteredTemplates.length === 0 && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                Aucun modele actif pour ce canal. Creez-en un dans l'onglet Modeles.
              </p>
            )}
          </div>

          {/* Segment filter */}
          <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">
              Filtre de segment (optionnel)
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div>
                <label className={labelCls}>Achats minimum</label>
                <input
                  type="number"
                  min="0"
                  value={campaignForm.min_purchases}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, min_purchases: e.target.value }))}
                  className={inputCls}
                  placeholder="Ex: 5"
                />
              </div>
              <div>
                <label className={labelCls}>Jours d'inactivite</label>
                <input
                  type="number"
                  min="0"
                  value={campaignForm.inactive_days}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, inactive_days: e.target.value }))}
                  className={inputCls}
                  placeholder="Ex: 30"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="seg-has-email"
                  checked={campaignForm.has_email}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, has_email: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="seg-has-email" className="text-sm text-gray-700 dark:text-gray-300">
                  A un email
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="seg-has-phone"
                  checked={campaignForm.has_phone}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, has_phone: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="seg-has-phone" className="text-sm text-gray-700 dark:text-gray-300">
                  A un telephone
                </label>
              </div>
            </div>
          </fieldset>

          {/* Scheduled at */}
          <div>
            <label className={labelCls}>Date d'envoi planifiee (optionnel)</label>
            <input
              type="datetime-local"
              value={campaignForm.scheduled_at}
              onChange={(e) => setCampaignForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Laissez vide pour un envoi manuel (brouillon).
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={closeCampaignModal} className={btnSecondary}>
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCampaignSave}
              disabled={saving || !campaignForm.name.trim() || !campaignForm.template}
              className={btnPrimary}
            >
              {saving ? 'Creation...' : 'Creer la campagne'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ========================================================================
  // MODAL: Campaign Preview
  // ========================================================================

  function renderCampaignPreviewModal() {
    const campaign = campaignsData?.results?.find((c) => c.id === previewCampaignId);

    return (
      <Modal
        open={!!previewCampaignId}
        title="Apercu de la campagne"
        onClose={() => setPreviewCampaignId(null)}
      >
        <div className="space-y-4">
          {campaign && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Campagne</span>
                <span className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{campaign.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Canal</span>
                {channelBadge(campaign.channel)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Statut</span>
                {campaignStatusBadge(campaign.status)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Modele</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">{campaign.template_name ?? '-'}</span>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            {previewLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Chargement de l'apercu...</p>
            ) : previewData ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Nombre de destinataires</span>
                  <span className="text-lg font-bold text-blue-900 dark:text-blue-200">{previewData.recipient_count}</span>
                </div>

                {previewData.sample_message && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exemple de message</h4>
                    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                      {previewData.sample_message}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                Aucune donnee d'apercu disponible.
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setPreviewCampaignId(null)} className={btnSecondary}>
              Fermer
            </button>
          </div>
        </div>
      </Modal>
    );
  }
}
