/** Customer Intelligence dashboard — segment overview, top clients, dormants, churn risk. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';
import {
  Brain,
  Clock,
  TrendingDown,
  Copy,
  Check,
  ExternalLink,
  Trophy,
  AlertTriangle,
  Star,
} from 'lucide-react';
import type {
  CustomerTopClientItem,
  CustomerDormantItem,
  CustomerChurnRiskItem,
} from '@/api/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function segmentLabel(value: string): string {
  const map: Record<string, string> = {
    VIP: 'VIP',
    REGULAR: 'Regulier',
    OCCASIONAL: 'Occasionnel',
    DORMANT: 'Dormant',
    RISK: 'Risque',
  };
  return map[value] ?? value;
}

function segmentTone(value: string): string {
  const map: Record<string, string> = {
    VIP: 'bg-emerald-100 text-emerald-800',
    REGULAR: 'bg-blue-100 text-blue-800',
    OCCASIONAL: 'bg-amber-100 text-amber-800',
    DORMANT: 'bg-gray-100 text-gray-700',
    RISK: 'bg-red-100 text-red-800',
  };
  return map[value] ?? 'bg-gray-100 text-gray-700';
}

function badgeTone(badge: string): string {
  if (badge === 'GOLD') return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (badge === 'SILVER') return 'bg-gray-50 text-gray-600 border border-gray-300';
  if (badge === 'BRONZE') return 'bg-orange-50 text-orange-700 border border-orange-200';
  return 'bg-gray-100 text-gray-600';
}

function badgeLabel(badge: string): string {
  if (badge === 'GOLD') return 'Or';
  if (badge === 'SILVER') return 'Argent';
  if (badge === 'BRONZE') return 'Bronze';
  return badge;
}

function badgeIcon(badge: string) {
  if (badge === 'GOLD') return <Trophy size={12} className="text-amber-600" />;
  if (badge === 'SILVER') return <Star size={12} className="text-gray-500" />;
  if (badge === 'BRONZE') return <Star size={12} className="text-orange-600" />;
  return null;
}

const SEGMENT_ORDER = ['VIP', 'REGULAR', 'OCCASIONAL', 'DORMANT', 'RISK'];

const SEGMENT_COLORS: Record<string, string> = {
  VIP: 'bg-emerald-500',
  REGULAR: 'bg-blue-500',
  OCCASIONAL: 'bg-amber-400',
  DORMANT: 'bg-gray-400',
  RISK: 'bg-red-500',
};

// ── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      title="Copier le message WhatsApp"
    >
      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      {copied ? 'Copie!' : 'Copier'}
    </button>
  );
}

// ── TabBar ───────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'dormant' | 'churn';

interface TabBarProps {
  active: Tab;
  onChange: (t: Tab) => void;
  dormantCount: number;
  churnCount: number;
}

function TabBar({ active, onChange, dormantCount, churnCount }: TabBarProps) {
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'dormant', label: 'Clients dormants', badge: dormantCount },
    { id: 'churn', label: 'Risque churn', badge: churnCount },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── OverviewTab ──────────────────────────────────────────────────────────────

function OverviewTab({
  segmentDistribution,
  topClients,
  openAlerts,
  dormantPreviewCount,
}: {
  segmentDistribution: Record<string, number>;
  topClients: CustomerTopClientItem[];
  openAlerts: Record<string, number>;
  dormantPreviewCount: number;
}) {
  const totalSegmented = SEGMENT_ORDER.reduce((s, k) => s + (segmentDistribution[k] ?? 0), 0);

  const totalAlerts = Object.values(openAlerts).reduce((s, v) => s + v, 0);

  const ALERT_LABELS: Record<string, string> = {
    DORMANT: 'Dormants',
    CHURN: 'Churn',
    CREDIT_RISK: 'Risque credit',
    NEXT_ORDER: 'Prochaine commande',
  };

  return (
    <div className="space-y-6">
      {/* Segment distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Distribution des segments
        </h3>
        {totalSegmented === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucune donnee de segmentation disponible pour aujourd'hui.</p>
        ) : (
          <div className="space-y-3">
            {/* Bar chart */}
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {SEGMENT_ORDER.filter((s) => (segmentDistribution[s] ?? 0) > 0).map((seg) => {
                const pct = ((segmentDistribution[seg] ?? 0) / totalSegmented) * 100;
                return (
                  <div
                    key={seg}
                    className={`${SEGMENT_COLORS[seg] ?? 'bg-gray-400'} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${segmentLabel(seg)}: ${segmentDistribution[seg]}`}
                  />
                );
              })}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
              {SEGMENT_ORDER.map((seg) => {
                const count = segmentDistribution[seg] ?? 0;
                const pct = totalSegmented > 0 ? ((count / totalSegmented) * 100).toFixed(0) : '0';
                return (
                  <div key={seg} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SEGMENT_COLORS[seg] ?? 'bg-gray-400'}`} />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{segmentLabel(seg)}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {count}
                        <span className="text-xs font-normal text-gray-400 ml-1">{pct}%</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top clients */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Top clients ce mois
          </h3>
          {topClients.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun classement disponible.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {topClients.map((item) => (
                <div key={item.customer_id} className="flex items-center gap-4 py-3">
                  {/* Rank */}
                  <div className="w-7 text-center flex-shrink-0">
                    <span className={`text-sm font-bold ${item.rank === 1 ? 'text-amber-600' : item.rank === 2 ? 'text-gray-500' : item.rank === 3 ? 'text-orange-600' : 'text-gray-400'}`}>
                      #{item.rank}
                    </span>
                  </div>
                  {/* Name + badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/customers/${item.customer_id}`}
                        className="font-medium text-sm text-gray-900 dark:text-gray-100 hover:text-primary truncate"
                      >
                        {item.customer_name}
                      </Link>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeTone(item.badge)}`}>
                        {badgeIcon(item.badge)}
                        {badgeLabel(item.badge)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {item.paid_orders ?? 0} commandes � {item.active_weeks ?? 0} sem. actives
                    </p>
                  </div>
                  {/* Score + amount */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(item.paid_amount)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Score {Number.isFinite(parseFloat(item.top_score)) ? (parseFloat(item.top_score) * 100).toFixed(0) : '0'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts + dormant summary */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
              Alertes ouvertes
            </h3>
            {totalAlerts === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aucune alerte ouverte.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(openAlerts).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{ALERT_LABELS[type] ?? type}</span>
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {dormantPreviewCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                    {dormantPreviewCount} client{dormantPreviewCount > 1 ? 's' : ''} dormant{dormantPreviewCount > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    A relancer en priorite
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DormantTab ───────────────────────────────────────────────────────────────

function DormantTab({ items }: { items: CustomerDormantItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <Clock size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Aucun client dormant detecte.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {items.length} client{items.length > 1 ? 's' : ''} sans commande depuis plus de 45 jours, trié par priorité de relance.
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.map((item) => (
          <div key={item.customer_id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <div className="flex flex-wrap items-start gap-4">
              {/* Priority score */}
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700">
                <span className="text-xs text-gray-400 dark:text-gray-500 leading-none">Score</span>
                <span className="text-base font-bold text-gray-800 dark:text-white leading-tight">{item.priority_score}</span>
              </div>

              {/* Customer info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Link
                    to={`/customers/${item.customer_id}`}
                    className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-primary flex items-center gap-1"
                  >
                    {item.customer_name}
                    <ExternalLink size={12} className="opacity-40" />
                  </Link>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${segmentTone(item.segment)}`}>
                    {segmentLabel(item.segment)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.customer_phone && <span className="mr-3">{item.customer_phone}</span>}
                  <span className="font-medium text-red-600 dark:text-red-400">{item.days_without_payment} jours</span> sans commande
                </p>
              </div>

              {/* WhatsApp copy */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <CopyButton text={item.whatsapp_preview} />
              </div>
            </div>

            {/* WhatsApp preview */}
            <div className="mt-3 ml-16 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{item.whatsapp_preview}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ChurnTab ─────────────────────────────────────────────────────────────────

function ChurnTab({ items }: { items: CustomerChurnRiskItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <TrendingDown size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Aucun client a risque de churn detecte.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {items.length} client{items.length > 1 ? 's' : ''} avec baisse significative d'activite sur les 30 derniers jours.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3 text-right">Chiffre precedent</th>
              <th className="px-5 py-3 text-right">Chiffre actuel</th>
              <th className="px-5 py-3 text-right">Baisse CA</th>
              <th className="px-5 py-3 text-right">Baisse freq.</th>
              <th className="px-5 py-3 text-right">Score churn</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const revDrop = parseFloat(item.revenue_drop_pct);
              const freqDrop = parseFloat(item.frequency_drop_pct);
              return (
                <tr key={item.customer_id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3">
                    <Link
                      to={`/customers/${item.customer_id}`}
                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary"
                    >
                      {item.customer_name}
                    </Link>
                    {item.customer_phone && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{item.customer_phone}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">
                    {formatCurrency(item.previous_paid_amount)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">
                    {formatCurrency(item.current_paid_amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-semibold ${revDrop >= 50 ? 'text-red-600 dark:text-red-400' : revDrop >= 30 ? 'text-orange-500' : 'text-amber-500'}`}>
                      -{revDrop.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-semibold ${freqDrop >= 50 ? 'text-red-600 dark:text-red-400' : freqDrop >= 30 ? 'text-orange-500' : 'text-amber-500'}`}>
                      -{freqDrop.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex flex-col items-end gap-1">
                      <span className="font-bold text-gray-900 dark:text-white">{item.churn_risk_score}/100</span>
                      <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.churn_risk_score >= 70 ? 'bg-red-500' : item.churn_risk_score >= 50 ? 'bg-orange-400' : 'bg-amber-400'}`}
                          style={{ width: `${item.churn_risk_score}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerIntelligencePage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const baseParams = useMemo(() => ({ store: storeId }), [storeId]);
  const churnParams = useMemo(() => ({ store: storeId, limit: '100' }), [storeId]);
  const dormantParams = useMemo(() => ({ store: storeId, limit: '100' }), [storeId]);

  const insightsQ = useQuery({
    queryKey: queryKeys.analytics.customerInsights(baseParams),
    queryFn: () => analyticsApi.customerInsights(baseParams),
    enabled: Boolean(storeId),
  });

  const churnQ = useQuery({
    queryKey: queryKeys.analytics.customerChurnRisk(churnParams),
    queryFn: () => analyticsApi.customerChurnRisk(churnParams),
    enabled: Boolean(storeId),
  });

  const dormantQ = useQuery({
    queryKey: queryKeys.analytics.customerDormant(dormantParams),
    queryFn: () => analyticsApi.customerDormant(dormantParams),
    enabled: Boolean(storeId),
  });

  const dormantItems = dormantQ.data?.items ?? [];
  const churnItems = churnQ.data?.items ?? [];
  const insights = insightsQ.data;
  const isLoading = insightsQ.isLoading;

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Brain size={36} className="text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">Selectionnez un magasin pour acceder a l'intelligence client.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Intelligence Client</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Analyse comportementale, segments et actions de relance
          </p>
        </div>
        {insights && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Donnees au {fmtDate(insights.as_of)}
          </p>
        )}
      </div>

      {/* KPI summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">VIP</p>
          <p className="text-2xl font-bold text-emerald-600">
            {isLoading ? '—' : (insights?.segment_distribution?.VIP ?? 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">Dormants</p>
          <p className="text-2xl font-bold text-amber-600">
            {dormantQ.isLoading ? '—' : dormantQ.data?.total ?? 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">Risque churn</p>
          <p className="text-2xl font-bold text-orange-600">
            {churnQ.isLoading ? '—' : churnQ.data?.total ?? 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">Alertes ouvertes</p>
          <p className="text-2xl font-bold text-red-600">
            {isLoading ? '—' : Object.values(insights?.open_alerts ?? {}).reduce((s, v) => s + v, 0)}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {(insightsQ.isError || churnQ.isError || dormantQ.isError) && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-900 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle size={16} />
          Certaines donnees n'ont pas pu etre chargees.
        </div>
      )}

      {/* Tabs */}
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        dormantCount={dormantQ.data?.total ?? 0}
        churnCount={churnQ.data?.total ?? 0}
      />

      {/* Loading state */}
      {isLoading && activeTab === 'overview' && (
        <div className="flex items-center gap-2.5 text-sm text-gray-400 py-8">
          <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin flex-shrink-0" />
          Chargement des analyses...
        </div>
      )}

      {/* Tab content */}
      {!isLoading && activeTab === 'overview' && insights && (
        <OverviewTab
          segmentDistribution={insights.segment_distribution}
          topClients={insights.top_clients}
          openAlerts={insights.open_alerts}
          dormantPreviewCount={insights.dormant_preview.length}
        />
      )}

      {activeTab === 'dormant' && (
        dormantQ.isLoading ? (
          <div className="flex items-center gap-2.5 text-sm text-gray-400 py-8">
            <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin flex-shrink-0" />
            Chargement des clients dormants...
          </div>
        ) : (
          <DormantTab items={dormantItems} />
        )
      )}

      {activeTab === 'churn' && (
        churnQ.isLoading ? (
          <div className="flex items-center gap-2.5 text-sm text-gray-400 py-8">
            <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin flex-shrink-0" />
            Chargement des risques churn...
          </div>
        ) : (
          <ChurnTab items={churnItems} />
        )
      )}
    </div>
  );
}

