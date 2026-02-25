/** Admin view for managing objective rules, seller stats, leaderboard settings, and penalties. */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { objectiveApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { useStoreStore } from '@/store-context/store-store';
import type { ObjectiveRule, SellerMonthlyStats, SellerPenaltyType } from '@/api/types';
import { Settings, Users, BarChart2, AlertTriangle, Plus, Edit2, Trash2, RefreshCw, CheckCircle, XCircle, DollarSign, ShoppingBag, Receipt, Percent, Wallet, Trophy, Search, ArrowDownUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import ObjectiveRuleForm from './components/admin/ObjectiveRuleForm';
import SellerPerformanceBoard from './components/admin/SellerPerformanceBoard';

const TABS = [
  { id: 'rules', label: 'Règles', icon: <Settings size={16} /> },
  { id: 'sellers', label: 'Vendeurs', icon: <Users size={16} /> },
  { id: 'leaderboard', label: 'Classement', icon: <BarChart2 size={16} /> },
  { id: 'penalties', label: 'Pénalités', icon: <AlertTriangle size={16} /> },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SellerSortKey =
  | 'seller_name'
  | 'gross_amount'
  | 'refund_amount'
  | 'net_amount'
  | 'net_delta'
  | 'sale_count'
  | 'cancellation_count'
  | 'cancellation_rate'
  | 'avg_basket'
  | 'credit_recovered'
  | 'contribution'
  | 'current_tier_rank'
  | 'bonus_earned'
  | 'achievement'
  | 'efficiency_score'
  | 'is_final';
type SortDirection = 'asc' | 'desc';

const SELLER_SORT_DEFAULT_DIRECTION: Record<SellerSortKey, SortDirection> = {
  seller_name: 'asc',
  gross_amount: 'desc',
  refund_amount: 'desc',
  net_amount: 'desc',
  net_delta: 'desc',
  sale_count: 'desc',
  cancellation_count: 'desc',
  cancellation_rate: 'asc',
  avg_basket: 'desc',
  credit_recovered: 'desc',
  contribution: 'desc',
  current_tier_rank: 'desc',
  bonus_earned: 'desc',
  achievement: 'desc',
  efficiency_score: 'desc',
  is_final: 'desc',
};

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function toAmount(value: string | number | null | undefined): number {
  const num = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(num) ? num : 0;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function previousPeriodOf(period: string): string {
  const [yearRaw, monthRaw] = period.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return period;
  }
  const d = new Date(year, month - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return formatPeriod(d.getFullYear(), d.getMonth() + 1);
}

function formatDeltaCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatDeltaNumber(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value)}`;
}

function formatDeltaPct(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)} pts`;
}

function trendColorClass(value: number, reverse = false): string {
  if (value === 0) return 'text-gray-500 dark:text-gray-400';
  const positive = reverse ? value < 0 : value > 0;
  return positive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function getSellerTarget(stat: SellerMonthlyStats): number {
  return (stat.tier_snapshot ?? []).reduce(
    (maxThreshold, tier) => Math.max(maxThreshold, toAmount(tier.threshold)),
    0,
  );
}

function getSellerCancellationRate(stat: SellerMonthlyStats): number {
  return stat.sale_count > 0 ? (stat.cancellation_count / stat.sale_count) * 100 : 0;
}

type SellerEfficiencySegment = 'EXCELLENT' | 'SOLIDE' | 'FRAGILE' | 'CRITIQUE';

type SellerEfficiencyProfile = {
  score: number;
  segment: SellerEfficiencySegment;
  issueCount: number;
  alert: string;
  action: string;
};

const DEFAULT_EFFICIENCY_PROFILE: SellerEfficiencyProfile = {
  score: 0,
  segment: 'CRITIQUE',
  issueCount: 1,
  alert: 'donnees insuffisantes',
  action: 'Lancer un recalcul et verifier les ventes',
};

function getEfficiencySegmentMeta(segment: SellerEfficiencySegment): {
  label: string;
  className: string;
} {
  switch (segment) {
    case 'EXCELLENT':
      return {
        label: 'Excellent',
        className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
      };
    case 'SOLIDE':
      return {
        label: 'Solide',
        className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      };
    case 'FRAGILE':
      return {
        label: 'Fragile',
        className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      };
    default:
      return {
        label: 'Critique',
        className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
      };
  }
}

function computeSellerEfficiency(
  stat: SellerMonthlyStats,
  context: { teamAverageBasket: number; maxNet: number },
): SellerEfficiencyProfile {
  const net = toAmount(stat.net_amount);
  const target = getSellerTarget(stat);
  const cancellationRate = getSellerCancellationRate(stat);
  const basket = toAmount(stat.avg_basket);

  const achievementPct = target > 0 ? (net / target) * 100 : net > 0 ? 70 : 0;
  const achievementIndex = clamp(achievementPct);
  const volumeIndex = context.maxNet > 0 ? clamp((net / context.maxNet) * 100) : 0;
  const basketIndex = context.teamAverageBasket > 0
    ? clamp((basket / context.teamAverageBasket) * 100)
    : basket > 0 ? 60 : 0;
  const disciplineIndex = clamp(100 - cancellationRate * 4);

  const score = Number(
    (
      (achievementIndex * 0.4)
      + (volumeIndex * 0.25)
      + (basketIndex * 0.2)
      + (disciplineIndex * 0.15)
    ).toFixed(1),
  );

  const issues: string[] = [];
  if (stat.sale_count === 0) issues.push('aucune vente');
  if (target > 0 && achievementPct < 80) issues.push('objectif en retard');
  if (cancellationRate >= 10) issues.push('annulations elevees');
  if (stat.sale_count >= 3 && basketIndex < 80) issues.push('panier faible');

  let segment: SellerEfficiencySegment = 'CRITIQUE';
  if (score >= 80) {
    segment = 'EXCELLENT';
  } else if (score >= 65) {
    segment = 'SOLIDE';
  } else if (score >= 50) {
    segment = 'FRAGILE';
  }

  let action = 'Suivi quotidien et coaching terrain';
  if (segment === 'EXCELLENT') {
    action = 'Maintenir le rythme et partager les bonnes pratiques';
  } else if (segment === 'SOLIDE') {
    action = 'Booster le panier moyen pour atteindre le palier suivant';
  } else if (segment === 'FRAGILE') {
    action = 'Plan de relance hebdomadaire sur conversion et objectif';
  }

  return {
    score,
    segment,
    issueCount: issues.length,
    alert: issues.length > 0 ? issues.join(' • ') : 'RAS',
    action,
  };
}

type SellerMetricSummary = {
  totalGross: number;
  totalRefund: number;
  totalNet: number;
  totalTarget: number;
  achievementPct: number;
  totalSales: number;
  totalCancellations: number;
  cancellationRate: number;
  averageBasket: number;
  totalBonus: number;
  totalCreditRecovered: number;
  finalizedCount: number;
  activeSellerCount: number;
  topSellerName: string;
  topSellerNet: number;
  tierBreakdown: Record<string, number>;
};

function buildSellerMetrics(stats: SellerMonthlyStats[]): SellerMetricSummary {
  if (stats.length === 0) {
    return {
      totalGross: 0,
      totalRefund: 0,
      totalNet: 0,
      totalTarget: 0,
      achievementPct: 0,
      totalSales: 0,
      totalCancellations: 0,
      cancellationRate: 0,
      averageBasket: 0,
      totalBonus: 0,
      totalCreditRecovered: 0,
      finalizedCount: 0,
      activeSellerCount: 0,
      topSellerName: '—',
      topSellerNet: 0,
      tierBreakdown: {},
    };
  }

  let totalGross = 0;
  let totalRefund = 0;
  let totalNet = 0;
  let totalTarget = 0;
  let totalSales = 0;
  let totalCancellations = 0;
  let totalBonus = 0;
  let totalCreditRecovered = 0;
  let finalizedCount = 0;
  let activeSellerCount = 0;
  let topSellerName = '—';
  let topSellerNet = -1;
  const tierBreakdown: Record<string, number> = {};

  for (const stat of stats) {
    const gross = toAmount(stat.gross_amount);
    const refund = toAmount(stat.refund_amount);
    const net = toAmount(stat.net_amount);
    const bonus = toAmount(stat.bonus_earned);
    const creditRecovered = toAmount(stat.credit_recovered);

    totalGross += gross;
    totalRefund += refund;
    totalNet += net;
    const sellerTarget = getSellerTarget(stat);
    totalTarget += sellerTarget;
    totalSales += stat.sale_count;
    totalCancellations += stat.cancellation_count;
    totalBonus += bonus;
    totalCreditRecovered += creditRecovered;

    if (stat.is_final) finalizedCount += 1;
    if (net > 0 || stat.sale_count > 0) activeSellerCount += 1;

    if (net > topSellerNet) {
      topSellerNet = net;
      topSellerName = stat.seller_name;
    }

    const tierName = stat.current_tier_name || 'Sans palier';
    tierBreakdown[tierName] = (tierBreakdown[tierName] ?? 0) + 1;
  }

  const averageBasket = totalSales > 0 ? totalNet / totalSales : 0;
  const cancellationRate = totalSales > 0 ? (totalCancellations / totalSales) * 100 : 0;
  const achievementPct = totalTarget > 0 ? (totalNet / totalTarget) * 100 : 0;

  return {
    totalGross,
    totalRefund,
    totalNet,
    totalTarget,
    achievementPct,
    totalSales,
    totalCancellations,
    cancellationRate,
    averageBasket,
    totalBonus,
    totalCreditRecovered,
    finalizedCount,
    activeSellerCount,
    topSellerName,
    topSellerNet: Math.max(topSellerNet, 0),
    tierBreakdown,
  };
}

export default function ObjectiveAdminPage() {
  const now = new Date();
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const [activeTab, setActiveTab] = useState<TabId>('rules');
  const [period, setPeriod] = useState(() => formatPeriod(now.getFullYear(), now.getMonth() + 1));
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ObjectiveRule | undefined>();
  const [sellersView, setSellersView] = useState<'visual' | 'table'>('visual');
  const [sellerSearch, setSellerSearch] = useState('');
  const [tableSort, setTableSort] = useState<{ key: SellerSortKey; direction: SortDirection }>({
    key: 'net_amount',
    direction: 'desc',
  });

  const qc = useQueryClient();

  // Rules
  const rulesQuery = useQuery({
    queryKey: ['objective-rules', storeId],
    queryFn: () => objectiveApi.listRules({ store: storeId }),
    enabled: !!storeId,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: any) => objectiveApi.createRule(data, { store: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objective-rules'] });
      toast.success('Règle créée avec succès.');
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      objectiveApi.updateRule(id, data, { store: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objective-rules'] });
      toast.success('Règle mise à jour (nouvelle version créée).');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => objectiveApi.deleteRule(id, { store: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objective-rules'] });
      toast.success('Règle supprimée.');
    },
  });

  // Sellers stats
  const statsQuery = useQuery({
    queryKey: ['admin-stats', storeId, period],
    queryFn: () => objectiveApi.adminStats({ store: storeId, period }),
    enabled: activeTab === 'sellers' && !!storeId,
  });
  const previousPeriod = useMemo(() => previousPeriodOf(period), [period]);
  const previousStatsQuery = useQuery({
    queryKey: ['admin-stats', storeId, previousPeriod],
    queryFn: () => objectiveApi.adminStats({ store: storeId, period: previousPeriod }),
    enabled: activeTab === 'sellers' && !!storeId,
  });

  const sellerStats = Array.isArray(statsQuery.data) ? statsQuery.data : [];
  const previousSellerStats = Array.isArray(previousStatsQuery.data) ? previousStatsQuery.data : [];

  const sellerMetrics = useMemo(() => buildSellerMetrics(sellerStats), [sellerStats]);
  const previousSellerMetrics = useMemo(
    () => buildSellerMetrics(previousSellerStats),
    [previousSellerStats],
  );
  const hasPreviousData = previousSellerStats.length > 0;

  const previousBySellerId = useMemo(() => {
    const map = new Map<string, SellerMonthlyStats>();
    for (const stat of previousSellerStats) {
      map.set(stat.seller, stat);
    }
    return map;
  }, [previousSellerStats]);

  const sellerEfficiencyById = useMemo(() => {
    const maxNet = sellerStats.reduce(
      (maxValue, stat) => Math.max(maxValue, toAmount(stat.net_amount)),
      0,
    );
    const map = new Map<string, SellerEfficiencyProfile>();
    for (const stat of sellerStats) {
      map.set(
        stat.seller,
        computeSellerEfficiency(stat, {
          teamAverageBasket: sellerMetrics.averageBasket,
          maxNet,
        }),
      );
    }
    return map;
  }, [sellerStats, sellerMetrics.averageBasket]);

  const efficiencySummary = useMemo(() => {
    const segmentCounts: Record<SellerEfficiencySegment, number> = {
      EXCELLENT: 0,
      SOLIDE: 0,
      FRAGILE: 0,
      CRITIQUE: 0,
    };

    const ranked = sellerStats
      .map((stat) => ({
        stat,
        profile: sellerEfficiencyById.get(stat.seller) ?? DEFAULT_EFFICIENCY_PROFILE,
      }))
      .sort((a, b) => b.profile.score - a.profile.score);

    let alertCount = 0;
    for (const item of ranked) {
      segmentCounts[item.profile.segment] += 1;
      if (item.profile.issueCount > 0) {
        alertCount += 1;
      }
    }

    const averageScore = ranked.length > 0
      ? ranked.reduce((sum, item) => sum + item.profile.score, 0) / ranked.length
      : 0;

    const coachList = ranked
      .filter((item) => item.profile.segment === 'CRITIQUE' || item.profile.segment === 'FRAGILE')
      .sort((a, b) => a.profile.score - b.profile.score)
      .slice(0, 5);

    return {
      averageScore,
      alertCount,
      segmentCounts,
      topPerformers: ranked.slice(0, 3),
      coachList,
    };
  }, [sellerStats, sellerEfficiencyById]);

  const teamDeltas = useMemo(
    () => ({
      net: sellerMetrics.totalNet - previousSellerMetrics.totalNet,
      sales: sellerMetrics.totalSales - previousSellerMetrics.totalSales,
      avgBasket: sellerMetrics.averageBasket - previousSellerMetrics.averageBasket,
      cancellationRate: sellerMetrics.cancellationRate - previousSellerMetrics.cancellationRate,
      bonus: sellerMetrics.totalBonus - previousSellerMetrics.totalBonus,
      activeSellers: sellerMetrics.activeSellerCount - previousSellerMetrics.activeSellerCount,
    }),
    [sellerMetrics, previousSellerMetrics],
  );

  const toggleTableSort = (key: SellerSortKey) => {
    setTableSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: SELLER_SORT_DEFAULT_DIRECTION[key],
      };
    });
  };

  const filteredSellerStats = useMemo(() => {
    const query = sellerSearch.trim().toLowerCase();
    const filtered = sellerStats.filter((stat) =>
      query ? stat.seller_name.toLowerCase().includes(query) : true,
    );
    const sorted = [...filtered];
    const getSortValue = (stat: SellerMonthlyStats): string | number => {
      switch (tableSort.key) {
        case 'seller_name':
          return stat.seller_name;
        case 'gross_amount':
          return toAmount(stat.gross_amount);
        case 'refund_amount':
          return toAmount(stat.refund_amount);
        case 'net_amount':
          return toAmount(stat.net_amount);
        case 'net_delta': {
          const previousStat = previousBySellerId.get(stat.seller);
          const previousNet = previousStat ? toAmount(previousStat.net_amount) : 0;
          return toAmount(stat.net_amount) - previousNet;
        }
        case 'sale_count':
          return stat.sale_count;
        case 'cancellation_count':
          return stat.cancellation_count;
        case 'cancellation_rate':
          return getSellerCancellationRate(stat);
        case 'avg_basket':
          return toAmount(stat.avg_basket);
        case 'credit_recovered':
          return toAmount(stat.credit_recovered);
        case 'contribution': {
          const netAmount = toAmount(stat.net_amount);
          return sellerMetrics.totalNet > 0 ? (netAmount / sellerMetrics.totalNet) * 100 : 0;
        }
        case 'current_tier_rank':
          return stat.current_tier_rank;
        case 'bonus_earned':
          return toAmount(stat.bonus_earned);
        case 'achievement': {
          const target = getSellerTarget(stat);
          return target > 0 ? (toAmount(stat.net_amount) / target) * 100 : 0;
        }
        case 'efficiency_score':
          return sellerEfficiencyById.get(stat.seller)?.score ?? 0;
        case 'is_final':
          return stat.is_final ? 1 : 0;
        default:
          return toAmount(stat.net_amount);
      }
    };

    sorted.sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);

      let cmp = 0;
      if (typeof aValue === 'string' || typeof bValue === 'string') {
        cmp = String(aValue).localeCompare(String(bValue), 'fr', { sensitivity: 'base' });
      } else {
        cmp = Number(aValue) - Number(bValue);
      }

      return tableSort.direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [
    sellerSearch,
    sellerStats,
    tableSort,
    previousBySellerId,
    sellerMetrics.totalNet,
    sellerEfficiencyById,
  ]);

  const sortIcon = (key: SellerSortKey) => {
    if (tableSort.key !== key) {
      return <ArrowDownUp size={12} className="text-gray-300 dark:text-gray-500" />;
    }
    return (
      <span className="text-[10px] leading-none text-gray-700 dark:text-gray-200">
        {tableSort.direction === 'asc' ? '^' : 'v'}
      </span>
    );
  };

  // Leaderboard settings
  const lbSettingsQuery = useQuery({
    queryKey: ['leaderboard-settings', storeId],
    queryFn: () => objectiveApi.leaderboardSettings({ store: storeId }),
    enabled: activeTab === 'leaderboard' && !!storeId,
  });

  const updateLbSettingsMutation = useMutation({
    mutationFn: (data: any) => objectiveApi.updateLeaderboardSettings(data, { store: storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaderboard-settings'] });
      toast.success('Paramètres du classement mis à jour.');
    },
  });

  // Penalty types
  const penaltyTypesQuery = useQuery({
    queryKey: ['penalty-types', storeId],
    queryFn: () => objectiveApi.listPenaltyTypes({ store: storeId }),
    enabled: activeTab === 'penalties' && !!storeId,
  });

  // Recompute
  const recomputeMutation = useMutation({
    mutationFn: (data: { period: string; seller_id?: string }) =>
      objectiveApi.recompute({ ...data, store: storeId }),
    onSuccess: () => toast.success('Recalcul lancé en arrière-plan.'),
  });

  if (!storeId) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Aucune boutique selectionnee.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-gray-600 dark:text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Objectifs - Administration
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Règles */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Les règles définissent les paliers et bonus mensuels.
            </p>
            <button
              onClick={() => { setEditingRule(undefined); setShowRuleForm(true); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <Plus size={16} /> Nouvelle règle
            </button>
          </div>
          {rulesQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-7 w-7 rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {(rulesQuery.data ?? []).map((rule) => (
                <div
                  key={rule.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {rule.name}
                        </h3>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">
                          v{rule.version}
                        </span>
                        {rule.is_active && (
                          <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {rule.valid_from}{' -> '}{rule.valid_until ?? 'Illimitée'}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {rule.tiers.map((t) => (
                          <span
                            key={t.id}
                            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: t.color }}
                          >
                            {t.name}: {formatCurrency(parseFloat(t.threshold))}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingRule(rule); setShowRuleForm(true); }}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Supprimer cette règle ?')) {
                            deleteRuleMutation.mutate(rule.id);
                          }
                        }}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(rulesQuery.data ?? []).length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Aucune règle définie. Créez votre première règle d'objectifs.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Vendeurs */}
      {activeTab === 'sellers' && (
        <div className="space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400">Periode :</label>
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Comparaison automatique avec {previousPeriod}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* Toggle visuel / tableau */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => setSellersView('visual')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sellersView === 'visual'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  📊 Visuel
                </button>
                <button
                  onClick={() => setSellersView('table')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sellersView === 'table'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  📋 Tableau
                </button>
              </div>

              {/* Search — table mode only */}
              {sellersView === 'table' && (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={sellerSearch}
                      onChange={(e) => setSellerSearch(e.target.value)}
                      placeholder="Rechercher un vendeur"
                      className="w-full sm:w-56 border border-gray-300 dark:border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Tri: clique sur les en-tetes de colonnes
                  </p>
                </>
              )}

              <button
                onClick={() => recomputeMutation.mutate({ period })}
                disabled={recomputeMutation.isPending}
                className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw size={15} className={recomputeMutation.isPending ? 'animate-spin' : ''} />
                Recalculer tout
              </button>
            </div>
          </div>

          {statsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-7 w-7 rounded-full border-b-2 border-blue-600" />
            </div>
          ) : sellersView === 'visual' ? (
            <SellerPerformanceBoard
              stats={sellerStats}
              sellerMetrics={sellerMetrics}
              teamDeltas={teamDeltas}
              hasPreviousData={hasPreviousData}
              previousPeriod={previousPeriod}
              efficiencyById={sellerEfficiencyById}
              efficiencySummary={efficiencySummary}
              previousBySellerId={previousBySellerId}
            />
          ) : (
            <>
              {sellerStats.length > 0 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><DollarSign size={14} /> Encaissement net equipe</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sellerMetrics.totalNet)}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.net)}`}>
                        {hasPreviousData ? `${formatDeltaCurrency(teamDeltas.net)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><ShoppingBag size={14} /> Ventes totales</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{sellerMetrics.totalSales}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.sales)}`}>
                        {hasPreviousData ? `${formatDeltaNumber(teamDeltas.sales)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Receipt size={14} /> Panier moyen equipe</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sellerMetrics.averageBasket)}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.avgBasket)}`}>
                        {hasPreviousData ? `${formatDeltaCurrency(teamDeltas.avgBasket)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Percent size={14} /> Taux annulation</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatPct(sellerMetrics.cancellationRate)}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.cancellationRate, true)}`}>
                        {hasPreviousData ? `${formatDeltaPct(teamDeltas.cancellationRate)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Wallet size={14} /> Bonus cumule</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sellerMetrics.totalBonus)}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.bonus)}`}>
                        {hasPreviousData ? `${formatDeltaCurrency(teamDeltas.bonus)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Wallet size={14} /> Credit recouvre</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sellerMetrics.totalCreditRecovered)}</p>
                      <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                        Brut: {formatCurrency(sellerMetrics.totalGross)}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Percent size={14} /> Atteinte objectif equipe</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatPct(sellerMetrics.achievementPct)}</p>
                      <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                        Objectif cumule: {formatCurrency(sellerMetrics.totalTarget)}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Users size={14} /> Vendeurs actifs</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{sellerMetrics.activeSellerCount}</p>
                      <p className={`text-xs mt-1 ${trendColorClass(teamDeltas.activeSellers)}`}>
                        {hasPreviousData ? `${formatDeltaNumber(teamDeltas.activeSellers)} vs ${previousPeriod}` : `Pas de donnees sur ${previousPeriod}`}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Receipt size={14} /> Remboursements</p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sellerMetrics.totalRefund)}</p>
                      <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Finalises: {sellerMetrics.finalizedCount}/{sellerStats.length}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Trophy size={14} /> Top vendeur</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{sellerMetrics.topSellerName}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{formatCurrency(sellerMetrics.topSellerNet)}</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Repartition des vendeurs par palier ({period})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(sellerMetrics.tierBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([tierName, count]) => (
                          <span
                            key={tierName}
                            className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                          >
                            {tierName}: {count}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Indice d'efficacite commerciale (0-100)
                      </p>
                      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {efficiencySummary.averageScore.toFixed(1)}
                      </p>
                      <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                        {efficiencySummary.alertCount} vendeur(s) avec alertes actives
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(['EXCELLENT', 'SOLIDE', 'FRAGILE', 'CRITIQUE'] as SellerEfficiencySegment[]).map((segment) => {
                          const meta = getEfficiencySegmentMeta(segment);
                          return (
                            <span
                              key={segment}
                              className={`text-xs px-2 py-1 rounded-full ${meta.className}`}
                            >
                              {meta.label}: {efficiencySummary.segmentCounts[segment]}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Top efficacite du mois</p>
                      <div className="mt-2 space-y-2">
                        {efficiencySummary.topPerformers.length === 0 && (
                          <p className="text-xs text-gray-400">Aucune donnee disponible.</p>
                        )}
                        {efficiencySummary.topPerformers.map(({ stat, profile }) => {
                          const meta = getEfficiencySegmentMeta(profile.segment);
                          return (
                            <div
                              key={`top-${stat.id}`}
                              className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 px-2.5 py-2"
                            >
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                {stat.seller_name}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${meta.className}`}>
                                  {meta.label}
                                </span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {profile.score.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Priorites coaching manager
                      </p>
                      <div className="mt-2 space-y-2">
                        {efficiencySummary.coachList.length === 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Aucun vendeur en zone de risque ce mois.
                          </p>
                        )}
                        {efficiencySummary.coachList.map(({ stat, profile }) => (
                          <div
                            key={`coach-${stat.id}`}
                            className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-2.5 py-2"
                          >
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              {stat.seller_name} • {profile.score.toFixed(1)}/100
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                              {profile.alert}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                              Action: {profile.action}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  {filteredSellerStats.length} vendeur(s) affiches sur {sellerStats.length}
                  {previousStatsQuery.isFetching && ' • mise a jour comparaison N-1...'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('seller_name')}
                            className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Vendeur {sortIcon('seller_name')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('gross_amount')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Brut {sortIcon('gross_amount')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('refund_amount')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Remb. {sortIcon('refund_amount')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('net_amount')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Net {sortIcon('net_amount')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('net_delta')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Evol. net {sortIcon('net_delta')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('sale_count')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Ventes {sortIcon('sale_count')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('cancellation_count')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Annul. {sortIcon('cancellation_count')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('cancellation_rate')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Tx annul. {sortIcon('cancellation_rate')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('avg_basket')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Panier {sortIcon('avg_basket')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('credit_recovered')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Credit rec. {sortIcon('credit_recovered')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('contribution')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Contrib. {sortIcon('contribution')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('current_tier_rank')}
                            className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Palier {sortIcon('current_tier_rank')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('bonus_earned')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Bonus {sortIcon('bonus_earned')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('achievement')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Atteinte {sortIcon('achievement')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('efficiency_score')}
                            className="ml-auto inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Score eff. {sortIcon('efficiency_score')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            onClick={() => toggleTableSort('is_final')}
                            className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            Statut {sortIcon('is_final')}
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                          Focus manager
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {filteredSellerStats.map((stat: SellerMonthlyStats) => {
                        const netAmount = toAmount(stat.net_amount);
                        const cancellationRate = getSellerCancellationRate(stat);
                        const contribution = sellerMetrics.totalNet > 0
                          ? (netAmount / sellerMetrics.totalNet) * 100
                          : 0;
                        const previousStat = previousBySellerId.get(stat.seller);
                        const netDelta = previousStat
                          ? netAmount - toAmount(previousStat.net_amount)
                          : null;
                        const sellerTarget = getSellerTarget(stat);
                        const achievement = sellerTarget > 0 ? (netAmount / sellerTarget) * 100 : 0;
                        const efficiency = sellerEfficiencyById.get(stat.seller) ?? DEFAULT_EFFICIENCY_PROFILE;
                        const efficiencyMeta = getEfficiencySegmentMeta(efficiency.segment);

                        return (
                          <tr key={stat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                              {stat.seller_name}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatCurrency(toAmount(stat.gross_amount))}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatCurrency(toAmount(stat.refund_amount))}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-gray-100">
                              {formatCurrency(netAmount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {netDelta === null ? (
                                <span className="text-gray-400">n/a</span>
                              ) : (
                                <span className={`inline-flex items-center gap-0.5 font-medium ${trendColorClass(netDelta)}`}>
                                  {netDelta > 0 && <ArrowUpRight size={13} />}
                                  {netDelta < 0 && <ArrowDownRight size={13} />}
                                  {formatDeltaCurrency(netDelta)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                              {stat.sale_count}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                              {stat.cancellation_count}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                              {formatPct(cancellationRate)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatCurrency(toAmount(stat.avg_basket))}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatCurrency(toAmount(stat.credit_recovered))}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatPct(contribution)}
                            </td>
                            <td className="px-4 py-3">
                              {stat.current_tier_name ? (
                                <span className="text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                  {stat.current_tier_name}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                              {toAmount(stat.bonus_earned) > 0 ? formatCurrency(toAmount(stat.bonus_earned)) : '—'}
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${trendColorClass(achievement - 100)}`}>
                              {sellerTarget > 0 ? formatPct(achievement) : 'n/a'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${efficiencyMeta.className}`}>
                                  {efficiencyMeta.label}
                                </span>
                                <span className="font-semibold text-gray-800 dark:text-gray-100">
                                  {efficiency.score.toFixed(1)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {stat.is_final ? (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <CheckCircle size={13} className="text-emerald-500" /> Cloture
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-blue-500">
                                  <RefreshCw size={13} /> En cours
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 min-w-[260px]">
                              <p className={`text-xs ${efficiency.issueCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                {efficiency.alert}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {efficiency.action}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredSellerStats.length === 0 && (
                        <tr>
                          <td colSpan={17} className="px-4 py-8 text-center text-gray-400 text-sm">
                            {sellerStats.length === 0
                              ? `Aucune donnee pour ${period}.`
                              : `Aucun vendeur ne correspond au filtre "${sellerSearch}".`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Classement */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          {lbSettingsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-7 w-7 rounded-full border-b-2 border-blue-600" />
            </div>
          ) : lbSettingsQuery.data ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                Paramètres du classement
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Visibilité
                  </label>
                  <select
                    defaultValue={lbSettingsQuery.data.visibility}
                    onChange={(e) =>
                      updateLbSettingsMutation.mutate({ visibility: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="FULL">Classement complet (noms visibles)</option>
                    <option value="TIER_AND_RANK">Palier + rang uniquement</option>
                    <option value="RANK_ONLY">Rang uniquement</option>
                    <option value="ANONYMOUS">Anonyme</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Intervalle de rafraîchissement (min)
                  </label>
                  <input
                    type="number"
                    defaultValue={lbSettingsQuery.data.refresh_interval_minutes}
                    onBlur={(e) =>
                      updateLbSettingsMutation.mutate({
                        refresh_interval_minutes: Number(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="show-amounts"
                    defaultChecked={lbSettingsQuery.data.show_amounts}
                    onChange={(e) =>
                      updateLbSettingsMutation.mutate({ show_amounts: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="show-amounts" className="text-sm text-gray-700 dark:text-gray-300">
                    Afficher les montants
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="show-tier"
                    defaultChecked={lbSettingsQuery.data.show_tier}
                    onChange={(e) =>
                      updateLbSettingsMutation.mutate({ show_tier: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="show-tier" className="text-sm text-gray-700 dark:text-gray-300">
                    Afficher les paliers
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab: Pénalités */}
      {activeTab === 'penalties' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gérez les types de pénalités disponibles pour cette boutique.
          </p>
          {penaltyTypesQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-7 w-7 rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {(penaltyTypesQuery.data ?? []).map((pt: SellerPenaltyType) => (
                <div
                  key={pt.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{pt.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Mode : {pt.mode === 'DEDUCTION' ? 'Déduction fixe' : 'Plafonnement palier'}
                      {pt.mode === 'DEDUCTION' && ` - ${formatCurrency(parseFloat(pt.default_amount))} par défaut`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pt.is_active ? (
                      <CheckCircle size={16} className="text-emerald-500" />
                    ) : (
                      <XCircle size={16} className="text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
              {(penaltyTypesQuery.data ?? []).length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Aucun type de pénalité configuré.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rule form modal */}
      {showRuleForm && (
        <ObjectiveRuleForm
          rule={editingRule}
          onSave={async (data) => {
            if (editingRule) {
              await updateRuleMutation.mutateAsync({ id: editingRule.id, data });
            } else {
              await createRuleMutation.mutateAsync(data);
            }
          }}
          onClose={() => setShowRuleForm(false)}
        />
      )}
    </div>
  );
}



