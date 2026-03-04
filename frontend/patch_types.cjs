const fs = require('fs');
const filePath = 'C:/Users/amado/Desktop/Systeme de gestion boutique/frontend/src/api/types.ts';
let content = fs.readFileSync(filePath, 'utf8');

const NEW_INTERFACES = `export interface Score360 {
  total: number;
  encaissement: number;
  credit: number;
  discipline: number;
  vitesse: number;
  actions: string[];
}

export interface RiskAnomalyItem {
  type: string;
  label: string;
  value: string;
  threshold: string;
}

export interface RiskAnalysis {
  risk_score: number;
  anomalies: RiskAnomalyItem[];
}

export interface MultiPeriodRankingEntry {
  rank: number;
  seller_id: string;
  seller_name: string;
  total: string;
  sale_count: number;
  is_me: boolean;
}

export interface MultiPeriodRanking {
  day: MultiPeriodRankingEntry[];
  week: MultiPeriodRankingEntry[];
  month: MultiPeriodRankingEntry[];
  gap_messages: {
    day: string | null;
    week: string | null;
    month: string | null;
  };
}

export interface CreditQualityTopDebtor {
  customer_name: string;
  overdue: string;
}

export interface CreditQuality {
  credit_issued: string;
  credit_recovered: string;
  recovery_rate: number;
  overdue_count: number;
  overdue_amount: string;
  avg_days_overdue: number;
  top_debtors: CreditQualityTopDebtor[];
}

export interface ProductMixCategory {
  category: string;
  revenue: string;
  pct: number;
  count: number;
}

export interface ProductMixProduct {
  product_name: string;
  revenue: string;
  quantity: number;
}

export interface ProductMix {
  by_category: ProductMixCategory[];
  top_products: ProductMixProduct[];
  total_items: number;
  total_revenue: string;
}

export type CoachingCategory = 'credit' | 'discipline' | 'performance' | 'speed';

export interface CoachingMission {
  id: string;
  category: CoachingCategory;
  title: string;
  detail: string;
  priority: number;
}

export interface CoachingData {
  period: string;
  morning_missions: CoachingMission[];
  evening_summary: {
    net_today: string;
    missions_done: number;
    missions_total: number;
  } | null;
}

`;

const MARKER = 'export interface SellerDashboard {';
if (!content.includes(MARKER)) { console.error('ERROR: MARKER not found'); process.exit(1); }
content = content.replace(MARKER, NEW_INTERFACES + MARKER);
console.log('Inserted new interfaces before SellerDashboard');

const OLD_END = '  last_updated: string | null;\n}';
const NEW_END = `  last_updated: string | null;
  score_360: Score360 | null;
  risk: RiskAnalysis | null;
  profile: string | null;
  has_active_rule: boolean;
}`;

const sellerIdx = content.indexOf('export interface SellerDashboard {');
const afterSeller = content.indexOf(OLD_END, sellerIdx);
if (afterSeller === -1) { console.error('ERROR: OLD_END not found after SellerDashboard'); process.exit(1); }
content = content.slice(0, afterSeller) + NEW_END + content.slice(afterSeller + OLD_END.length);
console.log('Extended SellerDashboard with 4 new fields');

fs.writeFileSync(filePath, content, 'utf8');
console.log('types.ts saved successfully');
