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

export type UserRole = 'ADMIN' | 'MANAGER' | 'SALES' | 'CASHIER' | 'STOCKER';

export type Capability =
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
  | 'CAN_SET_BUDGETS';

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

export interface Product {
  id: string;
  enterprise: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string;
  category: string;
  category_name: string;
  brand: string | null;
  brand_name: string | null;
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
  | 'CANCELLED';

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

export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT';

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
