/** Seller objective dashboard — tabbed view. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { objectiveApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';
import HeroSection from './components/HeroSection';
import MainProgressBar from './components/MainProgressBar';
import TierTimeline from './components/TierTimeline';
import ProjectionWidget from './components/ProjectionWidget';
import StatsCards from './components/StatsCards';
import MultiPeriodRankingPanel from './components/MultiPeriodRanking';
import BadgeShowcase from './components/BadgeShowcase';
import MonthlyHistoryTable from './components/MonthlyHistoryTable';
import DisciplineBlock from './components/DisciplineBlock';
import Score360Widget from './components/Score360Widget';
import RiskWidget from './components/RiskWidget';
import ProfileBadge from './components/ProfileBadge';
import CoachingWidget from './components/CoachingWidget';
import CreditQualityWidget from './components/CreditQualityWidget';
import ProductMixWidget from './components/ProductMixWidget';

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number);
  return { year: y, month: m };
}

function prevMonth(period: string) {
  const { year, month } = parsePeriod(period);
  return month === 1 ? formatPeriod(year - 1, 12) : formatPeriod(year, month - 1);
}

function nextMonth(period: string) {
  const { year, month } = parsePeriod(period);
  return month === 12 ? formatPeriod(year + 1, 1) : formatPeriod(year, month + 1);
}

const TABS = [
  { id: 'progress', label: 'Ma Progression' },
  { id: 'leaderboard', label: 'Classement' },
  { id: 'performance', label: 'Performance' },
  { id: 'coaching', label: 'Coaching' },
  { id: 'credit', label: 'Credit' },
  { id: 'products', label: 'Produits' },
  { id: 'badges', label: 'Badges' },
  { id: 'history', label: 'Historique' },
  { id: 'discipline', label: 'Discipline' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function TabLoader() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-blue-600" />
    </div>
  );
}

export default function SellerObjectivePage() {
  const now = new Date();
  const currentPeriod = formatPeriod(now.getFullYear(), now.getMonth() + 1);
  const currentStore = useStoreStore((s) => s.currentStore);
  const storeId = currentStore?.id ?? '';
  const [period, setPeriod] = useState(() => formatPeriod(now.getFullYear(), now.getMonth() + 1));
  const [activeTab, setActiveTab] = useState<TabId>('progress');
  const [historyYear, setHistoryYear] = useState(now.getFullYear());

  const isCurrentMonth = period === currentPeriod;

  const dashboardQuery = useQuery({
    queryKey: ['objective-dashboard', storeId, period],
    queryFn: () => objectiveApi.dashboard({ store: storeId, period }),
    enabled: !!storeId,
    refetchInterval: isCurrentMonth ? 15000 : false,
    refetchOnWindowFocus: isCurrentMonth,
  });

  const leaderboardQuery = useQuery({
    queryKey: ['objective-ranking', storeId, period],
    queryFn: () => objectiveApi.ranking({ store: storeId, period }),
    enabled: activeTab === 'leaderboard' && !!storeId,
    refetchInterval: activeTab === 'leaderboard' && isCurrentMonth ? 30000 : false,
  });

  const badgesQuery = useQuery({
    queryKey: ['my-badges', storeId],
    queryFn: () => objectiveApi.myBadges({ store: storeId }),
    enabled: activeTab === 'badges' && !!storeId,
  });

  const historyQuery = useQuery({
    queryKey: ['objective-history', storeId, historyYear],
    queryFn: () => objectiveApi.history({ store: storeId, year: String(historyYear) }),
    enabled: activeTab === 'history' && !!storeId,
  });

  const coachingQuery = useQuery({
    queryKey: ['objective-coaching', storeId, period],
    queryFn: () => objectiveApi.coaching({ store: storeId, period }),
    enabled: activeTab === 'coaching' && !!storeId,
    refetchInterval: activeTab === 'coaching' && isCurrentMonth ? 60000 : false,
  });

  const creditQuery = useQuery({
    queryKey: ['objective-credit-quality', storeId, period],
    queryFn: () => objectiveApi.creditQuality({ store: storeId, period }),
    enabled: activeTab === 'credit' && !!storeId,
  });

  const productMixQuery = useQuery({
    queryKey: ['objective-product-mix', storeId, period],
    queryFn: () => objectiveApi.productMix({ store: storeId, period }),
    enabled: activeTab === 'products' && !!storeId,
  });

  const data = dashboardQuery.data;
  const dashboardError =
    (dashboardQuery.error as any)?.response?.data?.detail ??
    (dashboardQuery.error as any)?.message ??
    null;

  if (!storeId) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Aucune boutique selectionnee.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + period nav */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Target size={24} className="text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mon Objectif</h1>
            {data && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {data.seller.name}
                  {data.objective.is_final && (
                    <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
                      Mois cloture
                    </span>
                  )}
                </p>
                {data.profile && <ProfileBadge profile={data.profile} />}
              </div>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <button
            onClick={() => setPeriod(prevMonth(period))}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-20 text-center">
            {period}
          </span>
          <button
            onClick={() => setPeriod(nextMonth(period))}
            disabled={isCurrentMonth}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading / Error for dashboard-dependent tabs */}
      {dashboardQuery.isLoading && (activeTab === 'progress' || activeTab === 'discipline' || activeTab === 'performance') && (
        <TabLoader />
      )}
      {dashboardQuery.isError && (activeTab === 'progress' || activeTab === 'discipline' || activeTab === 'performance') && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          Impossible de charger les statistiques objectifs. {dashboardError}
        </div>
      )}

      {/* ── Tab: Ma Progression ── */}
      {activeTab === 'progress' && data && (
        <div className="space-y-4">
          <HeroSection data={data} />
          <MainProgressBar data={data} />
          <TierTimeline
            tiers={data.tiers}
            currentRank={data.progress.current_tier_rank}
            netAmount={parseFloat(data.progress.net_amount)}
          />
          {data.projection && <ProjectionWidget projection={data.projection} />}
          <StatsCards stats={data.statistics} />
          {/* Inline score 360 + risk preview */}
          {data.score_360 && <Score360Widget score={data.score_360} />}
          {data.risk && <RiskWidget risk={data.risk} />}
        </div>
      )}

      {/* ── Tab: Classement ── */}
      {activeTab === 'leaderboard' && (
        <>
          {leaderboardQuery.isLoading ? (
            <TabLoader />
          ) : leaderboardQuery.data ? (
            <MultiPeriodRankingPanel data={leaderboardQuery.data} period={period} />
          ) : leaderboardQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              Impossible de charger le classement.
            </div>
          ) : null}
        </>
      )}

      {/* ── Tab: Performance ── */}
      {activeTab === 'performance' && data && (
        <div className="space-y-4">
          {data.score_360 && <Score360Widget score={data.score_360} />}
          {data.risk && <RiskWidget risk={data.risk} />}
        </div>
      )}

      {/* ── Tab: Coaching ── */}
      {activeTab === 'coaching' && (
        <>
          {coachingQuery.isLoading ? (
            <TabLoader />
          ) : coachingQuery.data ? (
            <CoachingWidget data={coachingQuery.data} />
          ) : coachingQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              Impossible de charger les missions de coaching.
            </div>
          ) : null}
        </>
      )}

      {/* ── Tab: Credit ── */}
      {activeTab === 'credit' && (
        <>
          {creditQuery.isLoading ? (
            <TabLoader />
          ) : creditQuery.data ? (
            <CreditQualityWidget data={creditQuery.data} />
          ) : creditQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              Impossible de charger les donnees de credit.
            </div>
          ) : null}
        </>
      )}

      {/* ── Tab: Produits ── */}
      {activeTab === 'products' && (
        <>
          {productMixQuery.isLoading ? (
            <TabLoader />
          ) : productMixQuery.data ? (
            <ProductMixWidget data={productMixQuery.data} />
          ) : productMixQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              Impossible de charger le mix produits.
            </div>
          ) : null}
        </>
      )}

      {/* ── Tab: Badges ── */}
      {activeTab === 'badges' && (
        <>
          {badgesQuery.isLoading ? (
            <TabLoader />
          ) : (
            <BadgeShowcase badges={badgesQuery.data ?? []} />
          )}
        </>
      )}

      {/* ── Tab: Historique ── */}
      {activeTab === 'history' && (
        <MonthlyHistoryTable
          history={historyQuery.data ?? []}
          currentYear={historyYear}
          onYearChange={setHistoryYear}
        />
      )}

      {/* ── Tab: Discipline ── */}
      {activeTab === 'discipline' && data && (
        <DisciplineBlock penalties={data.penalties} />
      )}
    </div>
  );
}
