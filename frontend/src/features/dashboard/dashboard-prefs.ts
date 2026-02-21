/** Zustand store persisting dashboard widget preferences in localStorage. */
import { create } from 'zustand';

export type WidgetKey =
  | 'kpis'
  | 'salesTrend'
  | 'paymentMethod'
  | 'categoryBar'
  | 'sellerBar'
  | 'topProducts'
  | 'alerts'
  | 'forecast'
  | 'stockTrend'
  | 'aiInsights';

interface WidgetConfig {
  key: WidgetKey;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { key: 'kpis', label: 'Indicateurs cles (KPI)', visible: true },
  { key: 'salesTrend', label: 'Tendance des ventes', visible: true },
  { key: 'paymentMethod', label: 'Methodes de paiement', visible: true },
  { key: 'categoryBar', label: 'Performance par categorie', visible: true },
  { key: 'sellerBar', label: 'Performance par vendeur', visible: true },
  { key: 'topProducts', label: 'Top produits', visible: true },
  { key: 'alerts', label: 'Alertes recentes', visible: true },
  { key: 'forecast', label: 'Previsions', visible: true },
  { key: 'stockTrend', label: 'Tendance stock', visible: true },
  { key: 'aiInsights', label: 'Insights AI', visible: true },
];

const STORAGE_KEY = 'dashboard_prefs';

function loadPrefs(): WidgetConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(stored) as WidgetConfig[];
    // Merge with defaults to handle new widgets added in updates
    return DEFAULT_WIDGETS.map((def) => {
      const saved = parsed.find((p) => p.key === def.key);
      return saved ? { ...def, visible: saved.visible } : def;
    });
  } catch {
    return DEFAULT_WIDGETS;
  }
}

interface DashboardPrefsState {
  widgets: WidgetConfig[];
  isConfigOpen: boolean;
  toggleWidget: (key: WidgetKey) => void;
  resetDefaults: () => void;
  openConfig: () => void;
  closeConfig: () => void;
  isVisible: (key: WidgetKey) => boolean;
}

export const useDashboardPrefs = create<DashboardPrefsState>((set, get) => ({
  widgets: loadPrefs(),
  isConfigOpen: false,
  toggleWidget: (key) =>
    set((s) => {
      const next = s.widgets.map((w) =>
        w.key === key ? { ...w, visible: !w.visible } : w,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return { widgets: next };
    }),
  resetDefaults: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ widgets: DEFAULT_WIDGETS });
  },
  openConfig: () => set({ isConfigOpen: true }),
  closeConfig: () => set({ isConfigOpen: false }),
  isVisible: (key) => get().widgets.find((w) => w.key === key)?.visible ?? true,
}));
