/** TypeScript interfaces mirroring Django serializers. */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: UserRole;
  custom_role: string | null;
  custom_role_name: string | null;
  is_active: boolean;
  is_superuser?: boolean;
}

export interface CustomRole {
  id: string;
  enterprise: string;
  name: string;
  base_role: UserRole;
  description: string;
  is_active: boolean;
  created_at: string;
}

export type UserRole = 'ADMIN' | 'MANAGER' | 'HR' | 'COMMERCIAL' | 'SALES' | 'CASHIER' | 'STOCKER';

export type Capability =
  | 'CAN_MANAGE_USERS'
  | 'CAN_MANAGE_STORES'
  | 'CAN_MANAGE_SUBSCRIPTIONS'
  | 'CAN_MANAGE_MODULES'
  | 'CAN_SELL'
  | 'CAN_CASH'
  | 'CAN_STOCK'
  | 'CAN_REFUND'
  | 'CAN_OVERRIDE_PRICE'
  | 'CAN_APPROVE'
  | 'CAN_VIEW_REPORTS'
  | 'CAN_CREATE_EXPENSE'
  | 'CAN_EDIT_EXPENSE'
  | 'CAN_VOID_EXPENSE'
  | 'CAN_VIEW_EXPENSE_REPORTS'
  | 'CAN_MANAGE_CATEGORIES'
  | 'CAN_MANAGE_WALLETS'
  | 'CAN_SET_BUDGETS'
  | 'CAN_MANAGE_LEADS'
  | 'CAN_MANAGE_OPPORTUNITIES'
  | 'CAN_LOG_ACTIVITY'
  | 'CAN_VIEW_COMMERCIAL_TEAM'
  | 'CAN_APPROVE_COMMERCIAL_BONUS'
  | 'CAN_EXPORT_COMMERCIAL'
  | 'CAN_VIEW_HRM'
  | 'CAN_MANAGE_HRM';

// ---------------------------------------------------------------------------
// Feature Flags (Enterprise/Store)
// ---------------------------------------------------------------------------

export type FeatureFlagKey =
  | 'sales_pos'
  | 'sales_refund'
  | 'cashier_operations'
  | 'stock_management'
  | 'stock_entries'
  | 'purchases_management'
  | 'credit_management'
  | 'expenses_management'
  | 'commercial_pipeline'
  | 'commercial_ai'
  | 'commercial_incentives'
  | 'commercial_exports'
  | 'hrm_management'
  | 'alerts_center'
  | 'reports_center'
  | 'vat'
  | 'enabled'
  | 'dashboard_strategic'
  | 'abc_analysis'
  | 'dynamic_reorder'
  | 'credit_scoring'
  | 'sales_forecast'
  | 'fraud_detection'
  | 'advanced_permissions';

export type FeatureFlags = Partial<Record<FeatureFlagKey, boolean>>;

export type ModuleCode =
  | 'CORE'
  | 'SELL'
  | 'CASH'
  | 'CUSTOMER'
  | 'STOCK'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'HRM'
  | 'COMMERCIAL'
  | 'SELLER_PERF'
  | 'ANALYTICS_MANAGER'
  | 'ANALYTICS_CASHIER'
  | 'ANALYTICS_STOCK'
  | 'ANALYTICS_DG'
  | 'CLIENT_INTEL'
  | 'ALERTS';

export type ModuleMatrix = Record<ModuleCode, boolean>;

export interface ModuleMatrixResponse {
  store_id: string;
  store_name: string;
  as_of: string;
  source: 'feature_flags' | 'plan' | string;
  plan_code: string | null;
  modules: Partial<ModuleMatrix>;
  features: FeatureFlags;
  capabilities: Capability[];
}

export interface TokenPair {
  access: string;
  refresh: string;
  user: User;
}

export interface LoginResponse {
  user: User;
  access?: string;
  refresh?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Enterprise & Store
// ---------------------------------------------------------------------------

export interface Enterprise {
  id: string;
  name: string;
  code: string;
  legal_name: string;
  registration_number: string;
  tax_id: string;
  currency: string;
  vat_enabled: boolean;
  vat_rate: string;
  email: string;
  phone: string;
  website: string;
  bank_details?: string;
  invoice_header?: string;
  invoice_template?: InvoiceTemplate;
  invoice_primary_color?: string;
  invoice_secondary_color?: string;
  offer_validity_days?: number;
  invoice_terms?: string;
  invoice_footer?: string;
  analytics_feature_flags?: FeatureFlags;
  effective_feature_flags?: FeatureFlags;
  can_create_stores: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_status: 'active' | 'expired' | 'scheduled' | 'inactive';
  is_active: boolean;
}

export type InvoiceTemplate = 'CLASSIC' | 'MODERN' | 'SIMPLE';

export type EnterpriseSubscriptionBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
export type EnterpriseSubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface EnterpriseSubscription {
  id: string;
  enterprise: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: EnterpriseSubscriptionBillingCycle;
  amount: string;
  currency: string;
  starts_on: string;
  ends_on: string | null;
  status: EnterpriseSubscriptionStatus;
  auto_renew: boolean;
  external_subscription_id: string;
  metadata: Record<string, unknown>;
  is_current: boolean;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseSubscriptionPayload {
  enterprise?: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: EnterpriseSubscriptionBillingCycle;
  amount: string;
  currency: string;
  starts_on: string;
  ends_on?: string | null;
  status: EnterpriseSubscriptionStatus;
  auto_renew: boolean;
  external_subscription_id?: string;
  metadata?: Record<string, unknown>;
}

export type EnterpriseResetMode = 'full' | 'transactions';
export type EnterpriseResetTarget =
  | 'commercial'
  | 'analytics'
  | 'objectives'
  | 'reports'
  | 'alerts'
  | 'expenses'
  | 'cashier'
  | 'credits'
  | 'sales'
  | 'purchases'
  | 'stock'
  | 'audit_logs'
  | 'sequences';
export type EnterpriseResetStockStrategy = 'keep' | 'zero' | 'delete';

export interface EnterpriseResetPayload {
  mode: EnterpriseResetMode;
  targets?: EnterpriseResetTarget[];
  stock_strategy?: EnterpriseResetStockStrategy;
}

export interface EnterpriseResetResponse {
  detail: string;
  mode: EnterpriseResetMode;
  targets: EnterpriseResetTarget[];
  stock_strategy: EnterpriseResetStockStrategy;
}

export interface BillingModule {
  id: string;
  code: ModuleCode;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

export interface BillingPlanModuleEntry {
  module_id: string;
  module_code: ModuleCode;
  module_name: string;
  module_description: string;
  module_display_order: number;
  included: boolean;
}

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  billing_cycle: EnterpriseSubscriptionBillingCycle;
  base_price_fcfa: number;
  currency: string;
  is_active: boolean;
  module_codes: ModuleCode[];
  modules: BillingPlanModuleEntry[];
}

export type ModuleEntitlementState = 'INHERIT' | 'ENABLED' | 'DISABLED';
export type EnterprisePlanStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface EnterprisePlanAssignment {
  id: string;
  enterprise: string;
  enterprise_name: string;
  plan: string;
  plan_code: string;
  plan_name: string;
  status: EnterprisePlanStatus;
  starts_on: string;
  ends_on: string | null;
  auto_renew: boolean;
  source_subscription: string | null;
  is_active_on_date: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnterprisePlanCurrentResponse {
  enterprise: { id: string; name: string; code: string } | null;
  assignment: EnterprisePlanAssignment | null;
}

export interface StoreModuleEntitlement {
  id: string;
  store: string;
  store_name: string;
  module: string;
  module_code: ModuleCode;
  module_name: string;
  state: ModuleEntitlementState;
  reason: string;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreModuleMatrixResponse {
  store: { id: string; name: string; code: string };
  entitlements: StoreModuleEntitlement[];
  effective_modules: Partial<ModuleMatrix>;
  source: string;
  plan_code: string | null;
  dependencies: Record<string, string[]>;
}

export interface Store {
  id: string;
  enterprise: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  logo?: string | null;
  currency: string;
  vat_enabled: boolean;
  vat_rate: string;
  legal_name?: string;
  registration_number?: string;
  tax_id?: string;
  bank_details?: string;
  invoice_header?: string;
  invoice_template?: InvoiceTemplate;
  invoice_primary_color?: string;
  invoice_secondary_color?: string;
  offer_validity_days?: number;
  invoice_terms?: string;
  invoice_footer?: string;
  analytics_feature_overrides?: FeatureFlags;
  effective_feature_flags?: FeatureFlags;
  is_active: boolean;
}

export interface MyStore extends Store {
  is_default: boolean;
  enterprise_name: string;
  my_capabilities: Capability[];
}

export interface StoreUserRecord {
  id: string;
  store: string;
  user: string;
  user_email: string;
  user_name: string;
  user_role: UserRole;
  is_default: boolean;
  capabilities: Capability[];
  effective_capabilities: Capability[];
}

export interface CapabilityPreset {
  label: string;
  capabilities: Capability[];
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  enterprise: string;
  name: string;
  slug: string;
  description: string;
  parent: string | null;
  parent_name: string | null;
  is_active: boolean;
}

export interface Brand {
  id: string;
  enterprise: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface ProductImage {
  id: string;
  product: string;
  image: string;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductSpec {
  id: string;
  product: string;
  key: string;
  value: string;
}

export type ProductType = 'PRODUCT' | 'SERVICE';

export interface Product {
  id: string;
  enterprise: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string;
  description: string;
  category: string;
  category_name: string;
  brand: string | null;
  brand_name: string | null;
  product_type: ProductType;
  track_stock: boolean;
  cost_price: string;
  selling_price: string;
  is_active: boolean;
  images: ProductImage[];
  specs: ProductSpec[];
}

// Lightweight product payload for POS (store-scoped availability).
export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  selling_price: string;
  product_type: ProductType;
  track_stock: boolean;
  is_active: boolean;
  available_qty: number;
  has_stock: boolean;
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export interface ProductStock {
  id: string;
  store: string;
  product: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  reserved_qty: number;
  min_qty: number;
  available_qty: number;
}

export type MovementType =
  | 'IN' | 'OUT' | 'ADJUST' | 'DAMAGE'
  | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'RETURN' | 'SALE' | 'PURCHASE';

export interface InventoryMovement {
  id: string;
  store: string;
  product: string;
  product_name: string;
  movement_type: MovementType;
  quantity: number;
  reference: string;
  reason: string;
  actor: string;
  actor_name: string | null;
  batch_id: string;
  created_at: string;
}

export interface MovementDocument {
  batch_id: string;
  doc_type: string;
  store_name: string;
  date: string;
  reference: string;
  reason: string;
  movements: InventoryMovement[];
  total_lines: number;
  total_qty: number;
}

// ---------------------------------------------------------------------------
// Stock Transfers
// ---------------------------------------------------------------------------

export type TransferStatus = 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface StockTransferLine {
  id: string;
  product: string;
  product_name: string;
  quantity: number;
  received_qty: number;
}

export interface StockTransfer {
  id: string;
  from_store: string;
  from_store_name: string;
  to_store: string;
  to_store_name: string;
  status: TransferStatus;
  created_by: string;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  notes: string;
  lines: StockTransferLine[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Stock Counts (Inventory)
// ---------------------------------------------------------------------------

export type CountStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface StockCountLine {
  id: string;
  product: string;
  product_name: string;
  system_qty: number;
  counted_qty: number | null;
  variance: number | null;
}

export interface StockCount {
  id: string;
  store: string;
  status: CountStatus;
  created_by: string;
  created_by_name: string | null;
  completed_at: string | null;
  notes: string;
  lines: StockCountLine[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  enterprise: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  company: string;
  full_name: string;
  is_default?: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}


// ---------------------------------------------------------------------------
// Cashier Analytics
// ---------------------------------------------------------------------------

export interface CashierKPIs {
  shift_count: number;
  closed_shifts: number;
  total_collected: string;
  transaction_count: number;
  avg_shift_duration_h: number;
  variance_total: string;
  variance_rate: number;
  avg_delay_seconds: number;
  avg_delay_minutes: number;
  refund_count: number;
}

export type CashierSegment = 'FIABLE' | 'SOLIDE' | 'FRAGILE' | 'RISQUE';

export interface CashierReliabilityScore {
  total: number;
  segment: CashierSegment;
  precision: number;
  speed: number;
  volume: number;
  reliability: number;
  actions: string[];
}

export interface CashierAnomalyItem {
  type: string;
  label: string;
  value: number;
  threshold: number;
  unit: string;
}

export interface CashierRiskAnalysis {
  risk_score: number;
  anomalies: CashierAnomalyItem[];
}

export interface CashierPaymentMethodEntry {
  method: string;
  label: string;
  amount: string;
  count: number;
  percentage: number;
}

export interface CashierPaymentMethods {
  total: string;
  by_method: CashierPaymentMethodEntry[];
}

export interface CashierShiftSummary {
  id: string;
  opened_at: string;
  closed_at: string | null;
  duration_h: number | null;
  status: string;
  total_collected: string;
  transaction_count: number;
  expected_cash: string;
  closing_cash: string | null;
  variance: string | null;
}

export interface CashierDashboardData {
  cashier: { id: string; name: string };
  period: string;
  kpis: CashierKPIs;
  score: CashierReliabilityScore;
  anomalies: CashierRiskAnalysis;
  payment_methods: CashierPaymentMethods;
  shifts: CashierShiftSummary[];
}

export interface CashierTeamMember {
  cashier_id: string;
  cashier_name: string;
  kpis: CashierKPIs;
  score: CashierReliabilityScore;
  anomalies: CashierRiskAnalysis;
  payment_methods: CashierPaymentMethods;
}

export interface CashierTeamData {
  period: string;
  team: CashierTeamMember[];
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SaleItem {
  id: string;
  product: string;
  product_name: string;
  unit_price: string;
  quantity: number;
  discount_amount: string;
  line_total: string;
}

export type SaleStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Sale {
  id: string;
  store: string;
  seller: string;
  seller_name: string | null;
  customer: string | null;
  customer_name: string | null;
  customer_is_default?: boolean;
  invoice_number: string | null;
  status: SaleStatus;
  subtotal: string;
  discount_amount: string;
  discount_percent: string;
  tax_amount: string;
  total: string;
  amount_paid: string;
  amount_due: string;
  items: SaleItem[];
  is_credit_sale: boolean;
  notes: string;
  source_quote: string | null;
  source_quote_number: string | null;
  submitted_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Quotes (Devis)
// ---------------------------------------------------------------------------

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REFUSED' | 'EXPIRED' | 'CONVERTED';

export interface QuoteItem {
  id: string;
  product: string;
  product_name: string;
  unit_price: string;
  quantity: number;
  discount_amount: string;
  line_total: string;
}

export interface Quote {
  id: string;
  store: string;
  created_by: string;
  created_by_name: string | null;
  customer: string | null;
  customer_name: string | null;
  quote_number: string | null;
  status: QuoteStatus;
  subtotal: string;
  discount_amount: string;
  discount_percent: string;
  tax_amount: string;
  total: string;
  valid_until: string | null;
  notes: string;
  conditions: string;
  refusal_reason: string;
  sent_at: string | null;
  accepted_at: string | null;
  refused_at: string | null;
  converted_at: string | null;
  converted_sale_id: string | null;
  converted_sale_invoice: string | null;
  is_expired: boolean;
  items: QuoteItem[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Payments & Cash Shifts
// ---------------------------------------------------------------------------

export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'CHEQUE';

export interface Payment {
  id: string;
  sale: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
  cashier: string;
  shift: string;
  created_at: string;
}

export interface CashShiftTotals {
  total_sales: string;
  total_cash_payments: string;
  total_mobile_payments: string;
  total_bank_payments: string;
  total_credit_payments: string;
}

export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface CashShift {
  id: string;
  store: string;
  cashier: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at: string | null;
  opening_float: string;
  expected_cash: string;
  closing_cash: string | null;
  variance: string | null;
  totals: CashShiftTotals;
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export interface CustomerAccount {
  id: string;
  store: string;
  customer: string;
  customer_name: string | null;
  customer_phone: string;
  credit_limit: string;
  balance: string;
  available_credit: string;
  is_active: boolean;
  created_at: string;
}

export interface CreditLedgerEntry {
  id: string;
  account: string;
  entry_type: string;
  amount: string;
  balance_after: string;
  reference: string;
  notes: string;
  sale: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreditPaymentResult extends CustomerAccount {
  payment_entry?: CreditLedgerEntry;
  receipt_url?: string;
}

export type ScheduleStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface PaymentSchedule {
  id: string;
  account: string;
  sale: string | null;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: ScheduleStatus;
  notes: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  enterprise: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order: string;
  product: string;
  product_name: string;
  product_sku: string;
  quantity_ordered: number;
  quantity_received: number;
  remaining_qty: number;
  unit_cost: string;
  line_total: string;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrder {
  id: string;
  store: string;
  supplier: string;
  supplier_name: string;
  created_by: string;
  created_by_name: string | null;
  po_number: string;
  status: PurchaseOrderStatus;
  subtotal: string;
  notes: string;
  created_at: string;
  updated_at: string;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderLineInput {
  product_id: string;
  quantity_ordered: number;
  unit_cost: string;
}

export interface PurchaseOrderCreatePayload {
  store: string;
  supplier: string;
  notes?: string;
  po_number?: string;
  submit_now?: boolean;
  lines: PurchaseOrderLineInput[];
}

export interface PurchaseOrderUpdatePayload {
  supplier?: string;
  notes?: string;
  lines?: PurchaseOrderLineInput[];
}

export interface GoodsReceiptLine {
  id: string;
  receipt: string;
  purchase_order_line: string;
  product_name: string;
  product_sku: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_received_total: number;
}

export interface GoodsReceipt {
  id: string;
  store: string;
  purchase_order: string;
  purchase_order_number: string;
  received_by: string;
  receipt_number: string;
  notes: string;
  created_at: string;
  lines: GoodsReceiptLine[];
}

export interface GoodsReceiptLineInput {
  purchase_order_line_id: string;
  quantity_received: number;
}

export interface GoodsReceiptCreatePayload {
  store: string;
  purchase_order: string;
  receipt_number?: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Alert {
  id: string;
  store: string;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// KPIs / Reports
// ---------------------------------------------------------------------------

export interface KPIData {
  total_sales: string;
  total_orders: number;
  average_basket: string;
  gross_margin: string;
  total_discounts: string;
  total_refunds: string;
  net_sales: string;
  credit_outstanding: string;
  stock_value: string;
  top_products: Array<{
    product__name: string;
    total_quantity: number;
    total_revenue: string;
  }>;
  sales_trend: Array<{
    date: string;
    total: string;
    count: number;
  }>;
}

// ---------------------------------------------------------------------------
// Sales Report (detailed breakdown)
// ---------------------------------------------------------------------------

export interface SalesReport {
  store: string;
  date_from: string;
  date_to: string;
  group_by?: string;
  filters?: {
    customer?: string | null;
    cashier?: string | null;
    product?: string | null;
  };
  summary: {
    total_revenue: string;
    total_orders: number;
    average_order: string;
    total_discounts: string;
    total_collected: string;
    total_outstanding: string;
  };
  payments_by_method: Array<{ method: string; total: string; count: number }>;
  by_seller: Array<{ seller: string; total_sales: string; order_count: number }>;
  by_category: Array<{ category: string; total_revenue: string; total_quantity: number }>;
  breakdown: Array<{ date: string; revenue: string; orders: number; discounts: string }>;
}

// ---------------------------------------------------------------------------
// Strategic KPIs (Analytics / AI)
// ---------------------------------------------------------------------------

export interface StrategicKPIs {
  feature_flags: Record<string, boolean>;
  date_from: string;
  date_to: string;
  revenue: string;
  revenue_growth_pct: string;
  orders: number;
  avg_basket: string;
  net_sales: string;
  stockout_count: number;
  active_sales_count: number;
  forecast_next_7d_qty: string;
  abc_distribution: Record<string, { revenue: string; products: number }>;
  reorder: { total: number; high: number; medium: number };
  credit: { scored_accounts: number; average_score: number; grade_breakdown: Record<string, number> };
  fraud: { events: number; critical: number; unresolved: number };
}

// ---------------------------------------------------------------------------
// Forecast Summary (Aggregated projections)
// ---------------------------------------------------------------------------

export interface ForecastSummary {
  daily: Array<{
    date: string;
    predicted_qty: number;
    predicted_revenue: string;
    predicted_profit: string;
  }>;
  totals: {
    predicted_qty: number;
    predicted_revenue: string;
    predicted_profit: string;
  };
}

// ---------------------------------------------------------------------------
// Margin Movers + Orientation Advice (Analytics)
// ---------------------------------------------------------------------------

export type MarginMovementBucket = 'FAST' | 'MEDIUM' | 'SLOW';

export interface MarginMoverItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity_sold: number;
  revenue: string;
  cost: string;
  margin_total: string;
  margin_rate_pct: string;
  avg_daily_qty: string;
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  min_stock: number;
  days_of_cover: string | null;
  movement_bucket: MarginMovementBucket;
  action_hint: string;
}

export interface MarginMoversSummary {
  period_days: number;
  sold_products: number;
  units_sold: number;
  revenue: string;
  margin_total: string;
  margin_rate_pct: string;
  high_margin_fast_count: number;
  low_margin_fast_count: number;
  slow_with_stock_count: number;
  at_risk_high_margin_count: number;
}

export interface MarginMoversResponse {
  date_from: string;
  date_to: string;
  limit: number;
  min_qty: string;
  total_rows: number;
  summary: MarginMoversSummary;
  items: MarginMoverItem[];
}

export interface OrientationSignal {
  code: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  metric: string;
  detail: string;
}

export interface OrientationRecommendation {
  priority: number;
  theme: string;
  title: string;
  action: string;
  reason: string;
  expected_impact: 'LOW' | 'MEDIUM' | 'HIGH' | string;
}

export interface OrientationAdvice {
  date_from: string;
  date_to: string;
  summary: MarginMoversSummary;
  signals: OrientationSignal[];
  recommendations: OrientationRecommendation[];
  focus_products: MarginMoverItem[];
}

// ---------------------------------------------------------------------------
// Customer Intelligence
// ---------------------------------------------------------------------------

export type CustomerIntelligenceSegment =
  | 'VIP'
  | 'REGULAR'
  | 'OCCASIONAL'
  | 'DORMANT'
  | 'RISK'
  | string;

export interface CustomerScoreSubscores {
  recency: number;
  frequency: number;
  monetary: number;
  credit: number;
  discount_behavior: number;
}

export interface CustomerScoreFeatures {
  recency_days: number;
  paid_orders_90d: number;
  monetary_90d: string;
  discount_ratio_90d: string;
  credit_overdue_amount: string;
  credit_recovery_ratio: string;
}

export interface CustomerScoreExplainItem {
  feature: string;
  impact: string;
}

export interface CustomerScoreResponse {
  customer_id: string;
  customer_name: string;
  store_id: string;
  as_of: string;
  ruleset_version: number;
  score_total: number;
  subscores: CustomerScoreSubscores;
  segment: CustomerIntelligenceSegment;
  features: CustomerScoreFeatures;
  explain: CustomerScoreExplainItem[];
}

export interface CustomerCreditRiskFeatures {
  overdue_amount: string;
  overdue_count: number;
  overdue_age_days: number;
  recovery_ratio: string;
  debt_growth_ratio_30d: string;
  balance: string;
  credit_limit: string;
}

export interface CustomerCreditRecommendation {
  action: string;
  label: string;
  recommended_deposit_percent: number;
  recommended_limit: string;
  reason: string;
}

export interface CustomerCreditRiskExplainItem {
  feature: string;
  impact_points: string;
}

export interface CustomerCreditRiskResponse {
  customer_id: string;
  customer_name: string;
  store_id: string;
  as_of: string;
  credit_risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  features: CustomerCreditRiskFeatures;
  explain: CustomerCreditRiskExplainItem[];
  recommendation: CustomerCreditRecommendation;
}

export interface CustomerCreditRiskListResponse {
  store_id: string;
  as_of: string;
  min_score: number;
  total: number;
  items: CustomerCreditRiskResponse[];
}

export interface CustomerRecommendationItem {
  product_id: string;
  sku: string;
  name: string;
  category: string | null;
  selling_price: string;
  score: number;
  source: 'FREQUENTLY_BOUGHT_TOGETHER' | 'NEXT_BEST_CATEGORY' | 'REFILL_RENEWAL' | string;
  reasons: string[];
  available_stock: number | null;
}

export interface CustomerRecommendationsResponse {
  customer_id: string;
  customer_name: string;
  store_id: string;
  as_of: string;
  window_days: number;
  limit: number;
  include_only_in_stock: boolean;
  items: CustomerRecommendationItem[];
  explain: string[];
}

export interface CustomerNextOrderResponse {
  customer_id: string;
  customer_name: string;
  store_id: string;
  as_of: string;
  predicted_next_purchase_date: string | null;
  days_until_prediction: number | null;
  probability: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  avg_interval_days: number | null;
  interval_std_days: number | null;
  purchase_count: number;
  recommendation: string;
}

export interface CustomerChurnRiskPeriod {
  start: string;
  end: string;
}

export interface CustomerChurnRiskItem {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  store_id: string;
  window_days: number;
  current_period: CustomerChurnRiskPeriod;
  previous_period: CustomerChurnRiskPeriod;
  current_paid_amount: string;
  previous_paid_amount: string;
  current_orders: number;
  previous_orders: number;
  revenue_drop_pct: string;
  frequency_drop_pct: string;
  churn_risk_score: number;
  actions: string[];
}

export interface CustomerChurnRiskListResponse {
  store_id: string;
  as_of: string;
  window_days: number;
  drop_threshold_pct: string;
  total: number;
  items: CustomerChurnRiskItem[];
}

export interface CustomerTopClientItem {
  rank: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  top_score: string;
  badge: 'GOLD' | 'SILVER' | 'BRONZE' | string;
  paid_amount: string | null;
  paid_orders: number | null;
  active_weeks: number | null;
  explain: string[];
}

export interface CustomerTopClientsResponse {
  store_id: string;
  period: string;
  limit: number;
  items: CustomerTopClientItem[];
}

export interface CustomerDormantItem {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  days_without_payment: number;
  priority_score: number;
  segment: CustomerIntelligenceSegment;
  score_total: number;
  reason: string;
  whatsapp_preview: string;
}

export interface CustomerDormantResponse {
  store_id: string;
  as_of: string;
  days: number | null;
  total: number;
  items: CustomerDormantItem[];
}

export interface CustomerInsightsResponse {
  store_id: string;
  period: string;
  as_of: string;
  top_clients: CustomerTopClientItem[];
  dormant_preview: CustomerDormantItem[];
  segment_distribution: Record<string, number>;
  open_alerts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Stock Value Trend
// ---------------------------------------------------------------------------

export interface StockValueTrend {
  trend: Array<{
    date: string;
    stock_value: string;
    gross_margin: string;
  }>;
}

// ---------------------------------------------------------------------------
// Daily Statistics (profit per day)
// ---------------------------------------------------------------------------

export interface DailyStatRow {
  date: string;
  nb_sales: number;
  revenue: string;
  profit: string;
  margin_pct: string;
  avg_basket: string;
  total_discounts: string;
  total_items: number;
}

export interface DailyStatistics {
  today: {
    revenue: string;
    profit: string;
    margin_pct: string;
    nb_sales: number;
    total_items: number;
  };
  summary: {
    total_revenue: string;
    nb_sales: number;
    avg_basket: string;
    total_discounts: string;
    total_profit: string;
    margin_pct: string;
    total_items: number;
    total_refunds: string;
  };
  daily: DailyStatRow[];
  top_products_by_profit: Array<{
    product_name: string;
    qty_sold: number;
    revenue: string;
    profit: string;
  }>;
  hourly_distribution: Array<{ hour: number; nb_sales: number; revenue: string }>;
  by_payment_method: Array<{ method: string; total: string; count: number }>;
  best_day: DailyStatRow | null;
  worst_day: DailyStatRow | null;
}

// ---------------------------------------------------------------------------
// Enterprise Setup (one-step creation)
// ---------------------------------------------------------------------------

export interface EnterpriseSetupPayload {
  enterprise_name: string;
  enterprise_code: string;
  enterprise_currency: string;
  enterprise_email: string;
  enterprise_phone: string;
  can_create_stores: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
  store_name: string;
  store_code: string;
  store_address: string;
  store_phone: string;
  store_email: string;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  user_phone: string;
  user_role: 'ADMIN' | 'MANAGER';
  user_password?: string;
  user_password_confirm?: string;
}

export interface ProvisionedCredentials {
  email: string;
  password: string;
  password_generated: boolean;
  email_sent: boolean;
  login_url: string;
}

export interface EnterpriseSetupResponse {
  enterprise: Enterprise;
  store: Store;
  admin_user: User;
  credentials: ProvisionedCredentials;
}

export interface CsvImportError {
  line: number;
  message: string;
}

export interface CsvImportResult {
  detail: string;
  total_rows: number;
  created: number;
  updated: number;
  skipped: number;
  error_count: number;
  errors: CsvImportError[];
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseCategoryType = 'STOCK' | 'FIXED' | 'VARIABLE';
export type WalletType = 'CASH' | 'BANK' | 'MOBILE_MONEY';
export type ExpenseStatus = 'POSTED' | 'VOIDED';
export type RecurringFrequency = 'WEEKLY' | 'MONTHLY';

export interface ExpenseCategory {
  id: string;
  enterprise: string;
  store: string | null;
  store_name: string | null;
  name: string;
  type: ExpenseCategoryType;
  is_active: boolean;
  created_at: string;
}

export interface Wallet {
  id: string;
  store: string;
  store_name: string;
  name: string;
  type: WalletType;
  balance: string;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  store: string;
  store_name: string;
  category: string;
  category_name: string;
  wallet: string;
  wallet_name: string;
  amount: string;
  description: string;
  supplier_name: string;
  expense_date: string;
  created_by: string;
  created_by_name: string;
  status: ExpenseStatus;
  posted_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string;
  void_reason: string;
  is_edit_locked: boolean;
  created_at: string;
}

export interface ExpenseBudget {
  id: string;
  store: string;
  store_name: string;
  category: string | null;
  category_name: string | null;
  period: string;
  limit_amount: string;
  alert_threshold_percent: number;
  created_at: string;
}

export interface RecurringExpense {
  id: string;
  store: string;
  store_name: string;
  category: string;
  category_name: string;
  wallet: string;
  wallet_name: string;
  amount: string;
  description: string;
  supplier_name: string;
  frequency: RecurringFrequency;
  next_run_date: string;
  is_active: boolean;
  created_by: string;
  last_run_at: string | null;
  created_at: string;
}

export interface ExpenseDashboardBudgetLine {
  budget_id: string;
  category_id: string | null;
  category_name: string;
  limit_amount: string;
  spent_amount: string;
  remaining_amount: string;
  consumed_percent: string;
  alert_threshold_percent: number;
  threshold_reached: boolean;
  over_budget: boolean;
}

export interface ExpenseDashboardData {
  store: { id: string; name: string };
  period: string;
  date_from: string;
  date_to: string;
  total_expenses: string;
  previous_total_expenses: string;
  comparison: { delta: string; growth_percent: string | null };
  by_category: Array<{ category_id: string; category__name: string; total: string }>;
  by_wallet: Array<{ wallet_id: string; wallet__name: string; wallet__type: WalletType; total: string }>;
  top_5_categories: Array<{ category_id: string; category__name: string; total: string }>;
  revenue_total: string;
  expense_ratio_percent: string;
  expense_ratio_alert_red: boolean;
  budgets: ExpenseDashboardBudgetLine[];
}

// ---------------------------------------------------------------------------
// Paginated response
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

export interface ObjectiveTier {
  id: string;
  rank: number;
  name: string;
  threshold: string;
  bonus_amount: string;
  bonus_rate: string;
  color: string;
  icon: string;
}

export interface ObjectiveRule {
  id: string;
  store: string;
  name: string;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  version: number;
  notes: string;
  tiers: ObjectiveTier[];
  created_at: string;
}

export interface SellerDashboardProgress {
  net_amount: string;
  current_tier_rank: number;
  current_tier_name: string;
  progress_pct: number;
  remaining_to_next: string;
}

export interface SellerDashboardProjection {
  daily_rate: string;
  projected_amount: string;
  next_tier_name: string | null;
  next_tier_threshold: string | null;
  days_to_next_tier: number | null;
  elapsed_days: number;
  remaining_days: number;
}

export interface Score360 {
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

export interface SellerDashboard {
  seller: { id: string; name: string; email: string };
  objective: { period: string; is_final: boolean };
  progress: SellerDashboardProgress;
  bonus: { earned: string };
  tiers: ObjectiveTier[];
  statistics: {
    sale_count: number;
    cancellation_count: number;
    avg_basket: string;
    credit_recovered: string;
    gross_amount: string;
    refund_amount: string;
  };
  penalties: {
    items: SellerPenaltyItem[];
    total_deduction: string;
  };
  projection: SellerDashboardProjection | null;
  ranking: {
    rank: number;
    total_sellers: number;
    rank_change: number;
  } | null;
  last_updated: string | null;
  score_360: Score360 | null;
  risk: RiskAnalysis | null;
  profile: string | null;
  has_active_rule: boolean;
}

export interface SellerPenaltyItem {
  id: string;
  type: string;
  mode: 'DEDUCTION' | 'HARD_CAP';
  amount: string;
  reason: string;
  created_at: string;
}

export interface SellerHistoryMonth {
  period: string;
  net_amount: string;
  sale_count: number;
  current_tier_rank: number;
  current_tier_name: string;
  bonus_earned: string;
  rank: number | null;
  is_final: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  seller_id: string;
  seller_name: string;
  net_amount?: string;
  sale_count: number;
  current_tier_rank?: number;
  current_tier_name?: string;
  bonus_earned?: string;
  rank_change: number;
  is_me: boolean;
}

export interface LeaderboardSettings {
  id: string;
  store: string;
  visibility: 'FULL' | 'TIER_AND_RANK' | 'RANK_ONLY' | 'ANONYMOUS';
  show_amounts: boolean;
  show_tier: boolean;
  refresh_interval_minutes: number;
}

export interface LeaderboardData {
  period: string;
  settings: LeaderboardSettings;
  entries: LeaderboardEntry[];
  computed_at: string;
}

export interface SellerMonthlyStats {
  id: string;
  store: string;
  seller: string;
  seller_name: string;
  period: string;
  gross_amount: string;
  refund_amount: string;
  net_amount: string;
  sale_count: number;
  cancellation_count: number;
  avg_basket: string;
  credit_recovered: string;
  current_tier_rank: number;
  current_tier_name: string;
  bonus_earned: string;
  tier_snapshot: ObjectiveTier[];
  is_final: boolean;
  last_trigger: string;
  computed_at: string | null;
}

export interface SellerPenaltyType {
  id: string;
  store: string;
  name: string;
  mode: 'DEDUCTION' | 'HARD_CAP';
  default_amount: string;
  cap_tier_rank: number | null;
  is_active: boolean;
}

export interface SellerPenalty {
  id: string;
  stats: string;
  penalty_type: string;
  penalty_type_name: string;
  penalty_mode: string;
  amount: string;
  reason: string;
  is_void: boolean;
  applied_by: string | null;
  created_at: string;
}

export interface SellerBadge {
  id: string;
  seller: string;
  store: string;
  badge_type: string;
  period: string;
  label: string;
  icon: string;
  created_at: string;
}

export interface SellerSprint {
  id: string;
  store: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: 'DRAFT' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  prize_description: string;
  created_by: string | null;
  results: SellerSprintResult[];
  live_rankings?: SprintLiveEntry[];
  created_at: string;
}

export interface SellerSprintResult {
  id: string;
  sprint: string;
  seller: string;
  seller_name: string;
  rank: number;
  amount: string;
  is_winner: boolean;
}

export interface SprintLiveEntry {
  rank: number;
  seller_id: string;
  seller_name: string;
  total: string;
  sale_count: number;
  is_me: boolean;
}

// ─── Stock Analytics ────────────────────────────────────────────────────────

export interface StockHealthScore {
  total: number;
  segment: 'SANTE' | 'CORRECT' | 'FRAGILE' | 'CRITIQUE';
  coverage: number;
  freshness: number;
  availability: number;
  reliability: number;
  actions: string[];
}

export interface StockKPIs {
  total_sku_count: number;
  total_products: number;
  total_stock_value: string;
  total_retail_value: string;
  potential_margin: string;
  low_stock_count: number;
  out_of_stock_count: number;
  dead_stock_count: number;
}

export interface StockRotationItem {
  product_id: string;
  product_name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  current_qty: number;
  sale_qty: number;
  rotation_rate: number;
}

export interface DeadStockItem {
  product_id: string;
  product_name: string;
  sku: string;
  category: string | null;
  current_qty: number;
  stock_value: string;
  days_since_last_sale: number | null;
  last_sale_date: string | null;
}

export interface RuptureRiskItem {
  product_id: string;
  product_name: string;
  sku: string;
  category: string | null;
  current_qty: number;
  avg_daily_sales: number;
  days_to_rupture: number;
  urgency: 'CRITICAL' | 'WARNING' | 'LOW';
}

export interface SuspiciousAdjustment {
  movement_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  type: string;
  reason: string;
  actor_name: string | null;
  created_at: string;
}

export interface StockDashboardData {
  store_id: string;
  period: string;
  kpis: StockKPIs;
  score: StockHealthScore;
  top_rotation: StockRotationItem[];
  bottom_rotation: StockRotationItem[];
  dead_stock: DeadStockItem[];
  rupture_risk: RuptureRiskItem[];
  suspicious_adjustments: SuspiciousAdjustment[];
}

export interface StockAlertsData {
  store_id: string;
  low_stock_count: number;
  out_of_stock_count: number;
  dead_stock_count: number;
  critical_ruptures: RuptureRiskItem[];
  warning_ruptures: RuptureRiskItem[];
}

// ─── DG Dashboard ───────────────────────────────────────────────────────────

export interface DGScores {
  sellers: number;
  cashiers: number;
  stock: number;
}

export interface DGRevenue {
  total_sales: string;
  total_collected: string;
  collected_on_period_sales: string;
  sale_count: number;
  avg_basket: string;
  cancellation_rate: number;
  refund_amount: string;
  collection_rate_cohort: number;
  cash_in_rate: number;
  collection_rate: number;
}

export interface DGTeam {
  seller_count: number;
  cashier_count: number;
}

export interface DGStockSummary {
  health_score: number;
  segment: string;
  low_stock_count: number;
  dead_stock_count: number;
  critical_ruptures: number;
  total_stock_value: string;
}

export interface DGTopSeller {
  id: string;
  name: string;
  gross_amount: string;
  score_360: number;
  current_tier_name: string;
}

export interface DGTopCashier {
  id: string;
  name: string;
  score: number;
  segment: string;
  total_collected: string;
}

export interface DGOrgAlert {
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
}

export interface DGDashboardData {
  period: string;
  store_id: string;
  global_score: number;
  scores: DGScores;
  revenue: DGRevenue;
  team: DGTeam;
  stock_summary: DGStockSummary;
  top_sellers: DGTopSeller[];
  top_cashiers: DGTopCashier[];
  org_alerts: DGOrgAlert[];
}

// ---------------------------------------------------------------------------
// HRM — Human Resource Management
// ---------------------------------------------------------------------------

export interface HrmDepartment {
  id: string;
  enterprise: string;
  name: string;
  code: string;
  parent: string | null;
  parent_name: string | null;
  head: string | null;
  head_name: string | null;
  is_active: boolean;
  employee_count: number;
  created_at: string;
  updated_at: string;
}

export interface HrmPosition {
  id: string;
  enterprise: string;
  title: string;
  code: string;
  department: string | null;
  department_name: string | null;
  min_salary: string;
  max_salary: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type HrmEmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED' | 'RESIGNED';
export type HrmGender = 'M' | 'F' | '';

export interface HrmEmployeeList {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  department: string | null;
  department_name: string | null;
  position: string | null;
  position_title: string | null;
  store: string | null;
  store_name: string | null;
  status: HrmEmployeeStatus;
  hire_date: string | null;
  photo: string | null;
  created_at: string;
}

export interface HrmEmployee extends HrmEmployeeList {
  enterprise: string;
  user: string | null;
  user_email: string | null;
  gender: HrmGender;
  date_of_birth: string | null;
  national_id: string;
  address: string;
  manager: string | null;
  manager_name: string | null;
  termination_date: string | null;
  base_salary: string;
  bank_name: string;
  bank_account: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  updated_at: string;
}

export type HrmContractType = 'CDI' | 'CDD' | 'STAGE' | 'INTERIM' | 'FREELANCE';
export type HrmContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export interface HrmContract {
  id: string;
  employee: string;
  employee_name: string | null;
  contract_type: HrmContractType;
  reference: string;
  start_date: string;
  end_date: string | null;
  salary: string;
  position: string | null;
  position_title: string | null;
  status: HrmContractStatus;
  notes: string;
  document: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrmAttendancePolicy {
  id: string;
  enterprise: string;
  name: string;
  work_start: string;
  work_end: string;
  break_minutes: number;
  late_tolerance_minutes: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type HrmAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY';

export interface HrmAttendance {
  id: string;
  employee: string;
  employee_name: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: HrmAttendanceStatus;
  late_minutes: number;
  overtime_minutes: number;
  notes: string;
  policy: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrmLeaveType {
  id: string;
  enterprise: string;
  name: string;
  code: string;
  default_days: number;
  is_paid: boolean;
  requires_document: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrmLeaveBalance {
  id: string;
  employee: string;
  employee_name: string | null;
  leave_type: string;
  leave_type_name: string | null;
  year: number;
  allocated: string;
  used: string;
  carried_over: string;
  remaining: string;
  created_at: string;
  updated_at: string;
}

export type HrmLeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface HrmLeaveRequest {
  id: string;
  employee: string;
  employee_name: string | null;
  leave_type: string;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  days_requested: string;
  reason: string;
  status: HrmLeaveRequestStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_comment: string;
  document: string | null;
  created_at: string;
  updated_at: string;
}

export type HrmPayrollPeriodStatus = 'OPEN' | 'PROCESSING' | 'CLOSED';

export interface HrmPayrollPeriod {
  id: string;
  enterprise: string;
  label: string;
  start_date: string;
  end_date: string;
  status: HrmPayrollPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  payslip_count: number;
  created_at: string;
  updated_at: string;
}

export type HrmPaySlipStatus = 'DRAFT' | 'VALIDATED' | 'PAID';

export interface HrmPaySlipLine {
  id: string;
  payslip: string;
  line_type: 'EARNING' | 'DEDUCTION';
  label: string;
  amount: string;
  sort_order: number;
}

export interface HrmPaySlip {
  id: string;
  period: string;
  period_label: string | null;
  employee: string;
  employee_name: string | null;
  base_salary: string;
  gross_salary: string;
  total_deductions: string;
  net_salary: string;
  status: HrmPaySlipStatus;
  paid_at: string | null;
  notes: string;
  lines: HrmPaySlipLine[];
  created_at: string;
  updated_at: string;
}

export type HrmSalaryComponentType = 'EARNING' | 'DEDUCTION';

export interface HrmSalaryComponent {
  id: string;
  enterprise: string;
  name: string;
  code: string;
  component_type: HrmSalaryComponentType;
  is_taxable: boolean;
  is_fixed: boolean;
  default_amount: string;
  default_percentage: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrmEmployeeSalaryComponent {
  id: string;
  employee: string;
  component: string;
  component_name: string | null;
  component_type: string | null;
  amount: string;
  percentage: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrmEvaluationCriteria {
  id: string;
  template: string;
  label: string;
  weight: string;
  sort_order: number;
}

export interface HrmEvaluationTemplate {
  id: string;
  enterprise: string;
  name: string;
  description: string;
  is_active: boolean;
  criteria: HrmEvaluationCriteria[];
  created_at: string;
  updated_at: string;
}

export type HrmPerformanceReviewStatus = 'DRAFT' | 'SUBMITTED' | 'COMPLETED';

export interface HrmPerformanceReviewScore {
  id: string;
  review: string;
  criteria: string;
  criteria_label: string | null;
  score: string;
  comment: string;
}

export interface HrmPerformanceReview {
  id: string;
  employee: string;
  employee_name: string | null;
  template: string | null;
  reviewer: string | null;
  reviewer_name: string | null;
  period_label: string;
  review_date: string;
  overall_score: string | null;
  status: HrmPerformanceReviewStatus;
  comments: string;
  employee_comments: string;
  scores: HrmPerformanceReviewScore[];
  created_at: string;
  updated_at: string;
}

export type HrmDisciplinarySeverity = 'VERBAL_WARNING' | 'WRITTEN_WARNING' | 'SUSPENSION' | 'TERMINATION';
export type HrmDisciplinaryStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'APPEALED';

export interface HrmDisciplinaryAction {
  id: string;
  employee: string;
  employee_name: string | null;
  severity: HrmDisciplinarySeverity;
  incident_date: string;
  description: string;
  action_taken: string;
  status: HrmDisciplinaryStatus;
  issued_by: string | null;
  issued_by_name: string | null;
  document: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type HrmDocType = 'CV' | 'ID_CARD' | 'DIPLOMA' | 'CERTIFICATE' | 'MEDICAL' | 'CONTRACT' | 'OTHER';

export interface HrmEmployeeDocument {
  id: string;
  employee: string;
  employee_name: string | null;
  doc_type: HrmDocType;
  title: string;
  file: string;
  expiry_date: string | null;
  notes: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrmHoliday {
  id: string;
  enterprise: string;
  name: string;
  date: string;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}
