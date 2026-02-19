/** AI Insights panel showing strategic analytics cards on the dashboard. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain,
  BarChart3,
  PackageSearch,
  Shield,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { StrategicKPIs } from '@/api/types';

interface AiInsightsPanelProps {
  data: StrategicKPIs | undefined;
  isLoading: boolean;
}

/* ------------------------------------------------------------------ */
/* Skeleton placeholder                                                */
/* ------------------------------------------------------------------ */

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-gray-100 rounded-xl h-48 animate-pulse"
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable insight card shell                                         */
/* ------------------------------------------------------------------ */

interface InsightCardProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function InsightCard({ icon, title, children }: InsightCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      {/* Top: icon + title */}
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>

      {/* Middle: content */}
      <div className="flex-1 space-y-2 text-sm text-gray-700">
        {children}
      </div>

      {/* Bottom: link */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <Link to="/analytics" className="text-sm text-primary hover:underline">
          Voir details &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ABC badge colour mapping                                            */
/* ------------------------------------------------------------------ */

const abcBadgeColor: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-yellow-100 text-yellow-800',
  C: 'bg-red-100 text-red-800',
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function AiInsightsPanel({ data, isLoading }: AiInsightsPanelProps) {
  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <Brain size={20} className="text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Insights IA</h2>
      </div>

      {/* Loading skeleton */}
      {isLoading && <SkeletonCards />}

      {/* No data */}
      {!isLoading && !data && (
        <p className="text-sm text-gray-400 py-6 text-center">
          Analytics non disponible
        </p>
      )}

      {/* Insight cards */}
      {!isLoading && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: ABC Distribution */}
          {data.feature_flags.abc_analysis && (
            <InsightCard
              icon={<BarChart3 size={18} className="text-blue-600" />}
              title="Classification ABC"
            >
              {Object.entries(data.abc_distribution).map(([cls, info]) => (
                <div key={cls} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center h-5 w-5 rounded text-xs font-bold ${
                        abcBadgeColor[cls] ?? 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {cls}
                    </span>
                    <span className="text-xs text-gray-600">
                      {info.products} produits
                    </span>
                  </div>
                  <span className="text-xs font-medium text-gray-900">
                    {formatCurrency(info.revenue)}
                  </span>
                </div>
              ))}
            </InsightCard>
          )}

          {/* Card 2: Reapprovisionnement */}
          {data.feature_flags.dynamic_reorder && (
            <InsightCard
              icon={<PackageSearch size={18} className="text-orange-600" />}
              title="Reapprovisionnement"
            >
              <p>{data.reorder.total} produits a commander</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                  {data.reorder.high} urgents
                </span>
                <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-medium">
                  {data.reorder.medium} moyens
                </span>
              </div>
            </InsightCard>
          )}

          {/* Card 3: Risque Credit */}
          {data.feature_flags.credit_scoring && (
            <InsightCard
              icon={<Shield size={18} className="text-purple-600" />}
              title="Risque Credit"
            >
              <p>
                Score moyen:{' '}
                <span className="font-medium">{data.credit.average_score}/100</span>
              </p>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    data.credit.average_score >= 70
                      ? 'bg-green-500'
                      : data.credit.average_score >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(data.credit.average_score, 100)}%` }}
                />
              </div>

              <p className="text-xs text-gray-500">
                {data.credit.scored_accounts} comptes evalues
              </p>
            </InsightCard>
          )}

          {/* Card 4: Previsions */}
          {data.feature_flags.sales_forecast && (
            <InsightCard
              icon={<TrendingUp size={18} className="text-emerald-600" />}
              title="Previsions 7 jours"
            >
              <p>
                <span className="font-medium">{data.forecast_next_7d_qty}</span> unites
                prevues
              </p>
              <p>
                Ruptures:{' '}
                <span className={data.stockout_count > 0 ? 'text-red-600 font-medium' : ''}>
                  {data.stockout_count}
                </span>
              </p>
            </InsightCard>
          )}

          {/* Card 5: Detection Fraude */}
          {data.feature_flags.fraud_detection && (
            <InsightCard
              icon={<AlertTriangle size={18} className="text-red-600" />}
              title="Detection Fraude"
            >
              <p>{data.fraud.events} evenements detectes</p>
              {data.fraud.critical > 0 && (
                <p className="text-red-600 font-medium">
                  {data.fraud.critical} critiques
                </p>
              )}
              <p className="text-xs text-gray-500">
                {data.fraud.unresolved} non resolus
              </p>
            </InsightCard>
          )}
        </div>
      )}
    </section>
  );
}
