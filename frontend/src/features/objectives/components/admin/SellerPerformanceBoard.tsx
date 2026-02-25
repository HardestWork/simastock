/** Visual performance board for admin/manager — replaces the dense table as the default view. */
import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCurrency } from '@/lib/currency';
import { TrendingUp, TrendingDown, AlertTriangle, Star, DollarSign } from 'lucide-react';
import type { SellerMonthlyStats } from '@/api/types';

// ─── local types (structurally compatible with parent) ────────────────────────

type SellerEfficiencySegment = 'EXCELLENT' | 'SOLIDE' | 'FRAGILE' | 'CRITIQUE';

type SellerEfficiencyProfile = {
  score: number;
  segment: SellerEfficiencySegment;
  issueCount: number;
  alert: string;
  action: string;
};

type SellerMetricSummary = {
  totalNet: number;
  totalTarget: number;
  achievementPct: number;
};

type TeamDeltas = {
  net: number;
};

type EfficiencySummary = {
  averageScore: number;
  alertCount: number;
  segmentCounts: Record<SellerEfficiencySegment, number>;
  topPerformers: Array<{ stat: SellerMonthlyStats; profile: SellerEfficiencyProfile }>;
  coachList: Array<{ stat: SellerMonthlyStats; profile: SellerEfficiencyProfile }>;
};

// ─── constants ────────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<
  SellerEfficiencySegment,
  { bar: string; badge: string; border: string; text: string }
> = {
  EXCELLENT: {
    bar: '#10b981',
    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    border: 'border-l-emerald-400 dark:border-l-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  SOLIDE: {
    bar: '#3b82f6',
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    border: 'border-l-blue-400 dark:border-l-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
  },
  FRAGILE: {
    bar: '#f59e0b',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    border: 'border-l-amber-400 dark:border-l-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  CRITIQUE: {
    bar: '#ef4444',
    badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
    border: 'border-l-rose-400 dark:border-l-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

const SEGMENT_LABELS: Record<SellerEfficiencySegment, string> = {
  EXCELLENT: 'Excellent',
  SOLIDE: 'Solide',
  FRAGILE: 'Fragile',
  CRITIQUE: 'Critique',
};

const MEDALS = ['🥇', '🥈', '🥉'];
// Display order: position 0=#2, position 1=#1, position 2=#3
const PODIUM_HEIGHTS = [80, 110, 60]; // px heights for positions [#2, #1, #3]

// ─── helpers ──────────────────────────────────────────────────────────────────

function toAmount(v: string | number | null | undefined): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function getSellerTarget(stat: SellerMonthlyStats): number {
  return (stat.tier_snapshot ?? []).reduce(
    (m: number, t: any) => Math.max(m, toAmount(t.threshold)),
    0,
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">—</span>;
  const good = value > 0;
  const Icon = good ? TrendingUp : TrendingDown;
  const sign = value > 0 ? '+' : '';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
      }`}
    >
      <Icon size={11} />
      {sign}
      {formatCurrency(Math.abs(value))}
    </span>
  );
}

function ScoreCircle({
  score,
  segment,
  size = 44,
}: {
  score: number;
  segment: SellerEfficiencySegment;
  size?: number;
}) {
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const fill = SEGMENT_COLORS[segment].bar;
  const dash = Math.min(score / 100, 1) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="currentColor" strokeWidth={3}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={fill} strokeWidth={3}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute text-xs font-bold"
        style={{ fontSize: size < 40 ? 9 : 11, color: fill }}
      >
        {Math.round(score)}
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const colors = SEGMENT_COLORS[d.segment as SellerEfficiencySegment];
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xl text-sm min-w-[170px]">
      <p className="font-semibold text-gray-900 dark:text-white mb-1.5">{d.fullName}</p>
      <p className="text-gray-600 dark:text-gray-300">Net : {formatCurrency(d.net)}</p>
      {d.target > 0 && (
        <p className="text-gray-500 dark:text-gray-400">
          Objectif : {formatCurrency(d.target)} ({d.achievement.toFixed(0)}%)
        </p>
      )}
      <p style={{ color: colors.bar }}>
        Score : {d.score.toFixed(1)} • {SEGMENT_LABELS[d.segment as SellerEfficiencySegment]}
      </p>
      {d.issue && (
        <p className="text-amber-500 dark:text-amber-400 text-xs mt-1.5 border-t border-gray-100 dark:border-gray-700 pt-1.5">
          {d.issue}
        </p>
      )}
    </div>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────

type Props = {
  stats: SellerMonthlyStats[];
  sellerMetrics: SellerMetricSummary;
  teamDeltas: TeamDeltas;
  hasPreviousData: boolean;
  previousPeriod: string;
  efficiencyById: Map<string, SellerEfficiencyProfile>;
  efficiencySummary: EfficiencySummary;
  previousBySellerId: Map<string, SellerMonthlyStats>;
};

// ─── main component ───────────────────────────────────────────────────────────

export default function SellerPerformanceBoard({
  stats,
  sellerMetrics,
  teamDeltas,
  hasPreviousData,
  previousPeriod,
  efficiencyById,
  efficiencySummary,
  previousBySellerId,
}: Props) {
  // Sort by net desc — this is the canonical order for ranks
  const sorted = useMemo(
    () => [...stats].sort((a, b) => toAmount(b.net_amount) - toAmount(a.net_amount)),
    [stats],
  );

  // Podium display order: [rank 2, rank 1, rank 3]
  const top3 = sorted.slice(0, 3);
  const podiumOrder = useMemo(() => {
    if (top3.length === 0) return [];
    if (top3.length === 1) return [{ stat: top3[0], rankIdx: 0, posIdx: 0 }];
    if (top3.length === 2)
      return [
        { stat: top3[1], rankIdx: 1, posIdx: 0 },
        { stat: top3[0], rankIdx: 0, posIdx: 1 },
      ];
    return [
      { stat: top3[1], rankIdx: 1, posIdx: 0 },
      { stat: top3[0], rankIdx: 0, posIdx: 1 },
      { stat: top3[2], rankIdx: 2, posIdx: 2 },
    ];
  }, [top3]);

  const chartData = useMemo(
    () =>
      sorted.map((stat) => {
        const eff = efficiencyById.get(stat.seller);
        const net = toAmount(stat.net_amount);
        const target = getSellerTarget(stat);
        return {
          name: stat.seller_name.split(' ')[0],
          fullName: stat.seller_name,
          net,
          target,
          achievement: target > 0 ? (net / target) * 100 : 0,
          score: eff?.score ?? 0,
          segment: eff?.segment ?? 'CRITIQUE',
          issue: eff && eff.issueCount > 0 ? eff.alert : '',
        };
      }),
    [sorted, efficiencyById],
  );

  if (stats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 py-16 text-center text-sm text-gray-400 dark:text-gray-500">
        Aucune donnée disponible pour cette période.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Section 1 : 3 KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Encaissement équipe */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <DollarSign size={13} />
            Encaissement net équipe
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(sellerMetrics.totalNet)}
          </p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {hasPreviousData ? (
              <DeltaBadge value={teamDeltas.net} />
            ) : (
              <span className="text-xs text-gray-400">vs {previousPeriod}</span>
            )}
            {sellerMetrics.totalTarget > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {sellerMetrics.achievementPct.toFixed(0)}% de l'objectif cumulé
              </span>
            )}
          </div>
          {sellerMetrics.totalTarget > 0 && (
            <div className="mt-2.5 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.min(sellerMetrics.achievementPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Score moyen d'efficacité */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Star size={13} />
            Score moyen d'efficacité
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {efficiencySummary.averageScore.toFixed(0)}
              <span className="text-sm font-normal text-gray-400">/100</span>
            </p>
          </div>
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {(['EXCELLENT', 'SOLIDE', 'FRAGILE', 'CRITIQUE'] as SellerEfficiencySegment[]).map((s) => {
              const count = efficiencySummary.segmentCounts[s];
              if (count === 0) return null;
              return (
                <span
                  key={s}
                  className={`text-[11px] px-2 py-0.5 rounded-full ${SEGMENT_COLORS[s].badge}`}
                >
                  {count} {SEGMENT_LABELS[s]}
                </span>
              );
            })}
          </div>
        </div>

        {/* Alertes */}
        <div
          className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
            efficiencySummary.alertCount > 0
              ? 'border-amber-200 dark:border-amber-800/50'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <AlertTriangle
              size={13}
              className={efficiencySummary.alertCount > 0 ? 'text-amber-500' : ''}
            />
            Alertes actives
          </div>
          {efficiencySummary.alertCount === 0 ? (
            <>
              <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">0</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                Toute l'équipe est en ordre.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
                {efficiencySummary.alertCount}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {efficiencySummary.segmentCounts.CRITIQUE > 0 &&
                  `${efficiencySummary.segmentCounts.CRITIQUE} critique`}
                {efficiencySummary.segmentCounts.CRITIQUE > 0 &&
                  efficiencySummary.segmentCounts.FRAGILE > 0 &&
                  ' · '}
                {efficiencySummary.segmentCounts.FRAGILE > 0 &&
                  `${efficiencySummary.segmentCounts.FRAGILE} fragile`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Section 2 : Podium top 3 ── */}
      {podiumOrder.length >= 2 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-5">
            Podium du mois
          </p>
          <div className="flex items-end justify-center gap-6">
            {podiumOrder.map(({ stat, rankIdx, posIdx }) => {
              const eff = efficiencyById.get(stat.seller);
              const segment = eff?.segment ?? 'CRITIQUE';
              const net = toAmount(stat.net_amount);
              const colors = SEGMENT_COLORS[segment];
              const height = PODIUM_HEIGHTS[posIdx];
              const isFirst = rankIdx === 0;
              return (
                <div
                  key={stat.id}
                  className="flex flex-col items-center gap-1.5"
                  style={{ minWidth: 90 }}
                >
                  <span className="text-3xl">{MEDALS[rankIdx]}</span>
                  <p
                    className={`text-sm font-semibold text-gray-900 dark:text-white text-center leading-tight ${
                      isFirst ? 'text-base' : ''
                    }`}
                  >
                    {stat.seller_name.split(' ')[0]}
                  </p>
                  {eff && (
                    <ScoreCircle score={eff.score} segment={segment} size={isFirst ? 48 : 40} />
                  )}
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums">
                    {formatCurrency(net)}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {stat.current_tier_name || 'Sans palier'}
                  </span>
                  <div
                    className="w-20 rounded-t-lg mt-1"
                    style={{ height, backgroundColor: colors.bar, opacity: 0.75 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 3 : Bar chart horizontal ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
          Encaissement net par vendeur
        </p>
        <ResponsiveContainer width="100%" height={Math.max(100, chartData.length * 44)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="net" radius={[0, 5, 5, 0]} barSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.fullName}`}
                  fill={SEGMENT_COLORS[entry.segment as SellerEfficiencySegment].bar}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="mt-3 flex gap-3 flex-wrap">
          {(['EXCELLENT', 'SOLIDE', 'FRAGILE', 'CRITIQUE'] as SellerEfficiencySegment[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[s].bar }} />
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{SEGMENT_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 4 : Seller cards grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {sorted.map((stat, idx) => {
          const eff = efficiencyById.get(stat.seller);
          const segment = eff?.segment ?? 'CRITIQUE';
          const net = toAmount(stat.net_amount);
          const target = getSellerTarget(stat);
          const achievement = target > 0 ? (net / target) * 100 : 0;
          const colors = SEGMENT_COLORS[segment];
          const prevStat = previousBySellerId.get(stat.seller);
          const netDelta = prevStat ? net - toAmount(prevStat.net_amount) : null;

          return (
            <div
              key={stat.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 border-l-4 p-3 space-y-2 ${colors.border}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">
                    {stat.seller_name}
                  </p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${colors.badge}`}>
                  {SEGMENT_LABELS[segment]}
                </span>
              </div>

              {/* Score + Net */}
              <div className="flex items-center gap-2">
                {eff && <ScoreCircle score={eff.score} segment={segment} size={40} />}
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(net)}
                  </p>
                  {target > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {achievement.toFixed(0)}% obj.
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {target > 0 && (
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(achievement, 100)}%`,
                      backgroundColor: SEGMENT_COLORS[segment].bar,
                    }}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                <span className="truncate">{stat.current_tier_name || 'Sans palier'}</span>
                {netDelta !== null && (
                  <span className={netDelta >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                    {netDelta >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(netDelta))}
                  </span>
                )}
              </div>

              {/* Alert */}
              {eff && eff.issueCount > 0 && (
                <p className={`text-[10px] leading-tight ${colors.text}`}>{eff.alert}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Section 5 : Actions requises ── */}
      {efficiencySummary.coachList.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-900/40 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Actions requises — {efficiencySummary.coachList.length} vendeur(s) en zone à risque
          </p>
          <div className="space-y-2">
            {efficiencySummary.coachList.map(({ stat, profile }) => (
              <div
                key={stat.id}
                className="flex items-start justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2.5 border border-amber-100 dark:border-amber-900/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {stat.seller_name}
                    </p>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        SEGMENT_COLORS[profile.segment].badge
                      }`}
                    >
                      {SEGMENT_LABELS[profile.segment]}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{profile.alert}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    → {profile.action}
                  </p>
                </div>
                <ScoreCircle score={profile.score} segment={profile.segment} size={40} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
