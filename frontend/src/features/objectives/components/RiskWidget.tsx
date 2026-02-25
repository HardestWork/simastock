/** Risk score widget — shows anomaly score and detected issues. */
import type { RiskAnalysis } from '@/api/types';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';

interface Props { risk: RiskAnalysis }

export default function RiskWidget({ risk }: Props) {
  const { risk_score, anomalies } = risk;
  const color =
    risk_score === 0 ? 'text-emerald-600' :
    risk_score <= 40 ? 'text-amber-600' : 'text-red-600';
  const bgColor =
    risk_score === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' :
    risk_score <= 40 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        Analyse de Risque
      </h3>

      {/* Score display */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgColor} mb-4`}>
        {risk_score === 0 ? (
          <ShieldCheck size={24} className="text-emerald-600 shrink-0" />
        ) : risk_score <= 40 ? (
          <AlertTriangle size={24} className="text-amber-600 shrink-0" />
        ) : (
          <AlertCircle size={24} className="text-red-600 shrink-0" />
        )}
        <div>
          <p className={`text-2xl font-bold ${color}`}>{risk_score}/100</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {risk_score === 0 ? 'Aucune anomalie detectee' :
             risk_score <= 40 ? 'Risque modere' : 'Risque eleve'}
          </p>
        </div>
      </div>

      {/* Anomalies list */}
      {anomalies.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <ShieldCheck size={16} />
          Comportement normal ce mois — continuez comme ca !
        </div>
      ) : (
        <ul className="space-y-2">
          {anomalies.map((a) => (
            <li
              key={a.type}
              className="flex items-start justify-between gap-3 p-2.5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800 rounded-lg text-sm"
            >
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-gray-300">{a.label}</span>
              </div>
              <span className="text-xs text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
                {a.value} (seuil: {a.threshold})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
