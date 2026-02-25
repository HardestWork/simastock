/** Risk score + anomaly list for a cashier. */
import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { CashierRiskAnalysis } from '@/api/types';

const ANOMALY_BADGES: Record<string, string> = {
  HIGH_VARIANCE: 'VAR',
  FAST_PAYMENT: 'FAST',
  SLOW_PAYMENT: 'SLOW',
  HIGH_REFUNDS: 'REF',
  LONG_SHIFTS: 'TIME',
};

export default function CashierAnomalyBlock({ risk }: { risk: CashierRiskAnalysis }) {
  if (risk.anomalies.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-900/40 p-4 flex items-center gap-3">
        <CheckCircle size={20} className="text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Aucune anomalie detectee</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Comportement conforme aux normes ce mois-ci.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800/50 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {risk.anomalies.length} anomalie(s) detectee(s)
          </p>
        </div>
        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
          Risque {risk.risk_score}/100
        </span>
      </div>
      <div className="space-y-2">
        {risk.anomalies.map((a) => (
          <div key={a.type} className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 px-3 py-2.5">
            <span className="shrink-0 inline-flex min-w-10 justify-center rounded-md border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              {ANOMALY_BADGES[a.type] ?? 'WARN'}
            </span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{a.label}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                Valeur: <strong>{a.value}{a.unit}</strong> - Seuil: {a.threshold}{a.unit}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}