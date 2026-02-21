/** Period selector with preset buttons and optional custom date range inputs. */
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';

type PeriodKey = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom';

interface PeriodSelectorProps {
  value: PeriodKey;
  dateFrom: string;
  dateTo: string;
  onChange: (period: PeriodKey, from: string, to: string) => void;
}

const presets: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: 'month', label: 'Ce mois' },
  { key: 'year', label: 'Cette annee' },
  { key: 'custom', label: 'Personnalise' },
];

function computeDates(period: PeriodKey): { from: string; to: string } {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  switch (period) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case '7d':
      return { from: format(subDays(today, 6), 'yyyy-MM-dd'), to: todayStr };
    case '30d':
      return { from: format(subDays(today, 29), 'yyyy-MM-dd'), to: todayStr };
    case 'month':
      return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: todayStr };
    case 'year':
      return { from: format(startOfYear(today), 'yyyy-MM-dd'), to: todayStr };
    default:
      return { from: todayStr, to: todayStr };
  }
}

export default function PeriodSelector({
  value,
  dateFrom,
  dateTo,
  onChange,
}: PeriodSelectorProps) {
  function handlePreset(key: PeriodKey) {
    if (key === 'custom') {
      onChange('custom', dateFrom, dateTo);
      return;
    }
    const { from, to } = computeDates(key);
    onChange(key, from, to);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => handlePreset(preset.key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            value === preset.key
              ? 'bg-primary text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {preset.label}
        </button>
      ))}

      {value === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onChange('custom', e.target.value, dateTo)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-100"
          />
          <span className="text-gray-400 dark:text-gray-500 text-sm">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onChange('custom', dateFrom, e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      )}
    </div>
  );
}

export type { PeriodKey, PeriodSelectorProps };
