/** Team cashier performance board for admin/manager. */
import { formatCurrency } from '@/lib/currency';
import { AlertTriangle } from 'lucide-react';
import type { CashierTeamMember, CashierSegment } from '@/api/types';

const SEG_COLORS: Record<CashierSegment, { badge: string; border: string; bar: string }> = {
  FIABLE: { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', border: 'border-l-emerald-400', bar: '#10b981' },
  SOLIDE: { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', border: 'border-l-blue-400', bar: '#3b82f6' },
  FRAGILE: { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', border: 'border-l-amber-400', bar: '#f59e0b' },
  RISQUE: { badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', border: 'border-l-rose-400', bar: '#ef4444' },
};

const SEG_LABELS: Record<CashierSegment, string> = {
  FIABLE: 'Fiable',
  SOLIDE: 'Solide',
  FRAGILE: 'Fragile',
  RISQUE: 'A risque',
};

function ScoreCircle({ score, segment }: { score: number; segment: CashierSegment }) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const color = SEG_COLORS[segment].bar;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: 44, height: 44 }}>
      <svg width={44} height={44} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="text-gray-200 dark:text-gray-700" />
        <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={3} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  );
}

export default function CashierTeamBoard({ team }: { team: CashierTeamMember[] }) {
  if (team.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 py-16 text-center text-sm text-gray-400">
        Aucun caissier actif cette periode.
      </div>
    );
  }

  const avgScore = team.reduce((s, m) => s + m.score.total, 0) / team.length;
  const alertCount = team.filter((m) => m.anomalies.anomalies.length > 0).length;
  const totalCollected = team.reduce((s, m) => s + parseFloat(m.kpis.total_collected), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total encaisse equipe</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Score moyen fiabilite</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{avgScore.toFixed(0)}<span className="text-sm font-normal text-gray-400">/100</span></p>
        </div>
        <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${alertCount > 0 ? 'border-amber-200 dark:border-amber-800/50' : 'border-gray-200 dark:border-gray-700'}`}>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <AlertTriangle size={13} className={alertCount > 0 ? 'text-amber-500' : ''} />
            Alertes anomalies
          </div>
          <p className={`mt-1.5 text-2xl font-bold ${alertCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{alertCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {team.map((member, idx) => {
          const seg = member.score.segment;
          const colors = SEG_COLORS[seg];
          const hasAnomalies = member.anomalies.anomalies.length > 0;
          return (
            <div key={member.cashier_id} className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 border-l-4 p-4 space-y-3 ${colors.border}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] text-gray-400">#{idx + 1}</span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.cashier_name}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${colors.badge}`}>{SEG_LABELS[seg]}</span>
              </div>
              <div className="flex items-center gap-3">
                <ScoreCircle score={member.score.total} segment={seg} />
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(parseFloat(member.kpis.total_collected))}</p>
                  <p className="text-[11px] text-gray-400">{member.kpis.transaction_count} transactions - {member.kpis.shift_count} shifts</p>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${member.score.total}%`, backgroundColor: colors.bar }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">Ecart caisse : <span className={Math.abs(parseFloat(member.kpis.variance_total)) > 1000 ? 'text-amber-500' : 'text-emerald-500'}>{member.kpis.variance_rate.toFixed(1)}%</span></span>
                {hasAnomalies && (
                  <span className="text-amber-500 flex items-center gap-0.5"><AlertTriangle size={10} /> {member.anomalies.anomalies.length} alerte(s)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
