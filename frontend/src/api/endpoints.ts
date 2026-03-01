/** Typed API endpoint functions organized by domain. */
import apiClient from './client';
import type {
  LoginCredentials,
  LoginResponse,
  User,
  CustomRole,
  MyStore,
  Enterprise,
  BillingModule,
  BillingPlan,
  EnterprisePlanAssignment,
  EnterprisePlanCurrentResponse,
  ModuleEntitlementState,
  EnterpriseSubscription,
  EnterpriseSubscriptionPayload,
  EnterpriseSetupPayload,
  EnterpriseSetupResponse,
  EnterpriseResetPayload,
  EnterpriseResetResponse,
  Store,
  StoreModuleEntitlement,
  StoreModuleMatrixResponse,
  Category,
  Brand,
  Product,
  PosProduct,
  ProductStock,
  InventoryMovement,
  MovementDocument,
  StockTransfer,
  StockCount,
  Customer,
  Sale,
  Quote,
  Payment,
  CashShift,
  CustomerAccount,
  CreditPaymentResult,
  CreditLedgerEntry,
  PaymentSchedule,
  Supplier,
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  PurchaseOrderUpdatePayload,
  GoodsReceipt,
  GoodsReceiptCreatePayload,
  Alert,
  KPIData,
  SalesReport,
  StrategicKPIs,
  ForecastSummary,
  MarginMoversResponse,
  OrientationAdvice,
  StockValueTrend,
  DailyStatistics,
  CsvImportResult,
  ExpenseCategory,
  Wallet,
  Expense,
  ExpenseBudget,
  RecurringExpense,
  ExpenseDashboardData,
  StoreUserRecord,
  CapabilityPreset,
  PaginatedResponse,
  ObjectiveRule,
  SellerDashboard,
  SellerHistoryMonth,
  LeaderboardData,
  LeaderboardSettings,
  SellerMonthlyStats,
  SellerPenaltyType,
  SellerPenalty,
  SellerBadge,
  SellerSprint,
  MultiPeriodRanking,
  CreditQuality,
  ProductMix,
  CoachingData,
  CashierDashboardData,
  CashierTeamData,
  StockDashboardData,
  StockAlertsData,
  DGDashboardData,
  CustomerScoreResponse,
  CustomerCreditRiskResponse,
  CustomerCreditRiskListResponse,
  CustomerRecommendationsResponse,
  CustomerNextOrderResponse,
  CustomerChurnRiskListResponse,
  CustomerTopClientsResponse,
  CustomerDormantResponse,
  CustomerInsightsResponse,
  ModuleMatrixResponse,
  HrmDepartment,
  HrmPosition,
  HrmEmployeeList,
  HrmEmployee,
  HrmContract,
  HrmAttendancePolicy,
  HrmAttendance,
  HrmLeaveType,
  HrmLeaveBalance,
  HrmLeaveRequest,
  HrmPayrollPeriod,
  HrmPaySlip,
  HrmPaySlipLine,
  HrmSalaryComponent,
  HrmEmployeeSalaryComponent,
  HrmEvaluationTemplate,
  HrmEvaluationCriteria,
  HrmPerformanceReview,
  HrmPerformanceReviewScore,
  HrmDisciplinaryAction,
  HrmEmployeeDocument,
  HrmHoliday,
  DocumentVerification,
} from './types';
import type { Capability } from './types';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  login: (creds: LoginCredentials) =>
    apiClient.post<LoginResponse>('auth/token/', creds).then((r) => r.data),

  csrf: () =>
    apiClient.get<{ csrfToken: string }>('auth/csrf/').then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient
      .post<{ access: string }>('auth/token/refresh/', { refresh: refreshToken })
      .then((r) => r.data),

  logout: () =>
    apiClient.post('auth/logout/').then((r) => r.data),

  me: () => apiClient.get<User>('auth/me/').then((r) => r.data),

  moduleMatrix: (params?: { store?: string }) =>
    apiClient.get<ModuleMatrixResponse>('auth/module-matrix/', { params }).then((r) => r.data),

  updateMe: (data: Partial<Pick<User, 'first_name' | 'last_name' | 'phone'>>) =>
    apiClient.patch<User>('auth/me/', data).then((r) => r.data),

  changePassword: (data: { old_password: string; new_password: string }) =>
    apiClient.post('auth/password/change/', data).then((r) => r.data),

  requestPasswordReset: (email: string) =>
    apiClient.post<{ detail: string; debug_reset_url?: string }>('auth/password/reset/', { email }).then((r) => r.data),

  confirmPasswordReset: (data: { uid: string; token: string; new_password1: string; new_password2: string }) =>
    apiClient.post<{ detail: string }>('auth/password/reset/confirm/', data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const userApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<User>>('users/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<User>(`users/${id}/`).then((r) => r.data),

  create: (data: { email: string; first_name: string; last_name: string; phone?: string; role: string; password: string; password_confirm: string }) =>
    apiClient.post<User>('users/', data).then((r) => r.data),

  update: (id: string, data: Partial<User>) =>
    apiClient.patch<User>(`users/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`users/${id}/`),
};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const roleApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<CustomRole>>('roles/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<CustomRole>(`roles/${id}/`).then((r) => r.data),

  create: (data: Partial<CustomRole>) =>
    apiClient.post<CustomRole>('roles/', data).then((r) => r.data),

  update: (id: string, data: Partial<CustomRole>) =>
    apiClient.patch<CustomRole>(`roles/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`roles/${id}/`),
};

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const storeApi = {
  myStores: () =>
    apiClient.get<MyStore[]>('stores/my-stores/').then((r) => r.data),

  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Store>>('stores/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Store>(`stores/${id}/`).then((r) => r.data),

  create: (data: { name: string; code: string; address?: string; phone?: string; email?: string }) =>
    apiClient.post<Store>('stores/', data).then((r) => r.data),

  update: (id: string, data: Partial<Store>) =>
    apiClient.patch<Store>(`stores/${id}/`, data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Store Users (capabilities management)
// ---------------------------------------------------------------------------

export const storeUserApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<StoreUserRecord>>('store-users/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<StoreUserRecord>(`store-users/${id}/`).then((r) => r.data),

  update: (id: string, data: { capabilities: Capability[] }) =>
    apiClient.patch<StoreUserRecord>(`store-users/${id}/`, data).then((r) => r.data),

  presets: () =>
    apiClient.get<{ presets: Record<string, CapabilityPreset>; all_capabilities: { code: string; label: string }[] }>('store-users/presets/').then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Enterprises
// ---------------------------------------------------------------------------

export const enterpriseApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Enterprise>>('enterprises/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Enterprise>(`enterprises/${id}/`).then((r) => r.data),

  update: (id: string, data: Partial<Enterprise>) =>
    apiClient.patch<Enterprise>(`enterprises/${id}/`, data).then((r) => r.data),

  toggleActive: (id: string) =>
    apiClient.post<Enterprise>(`enterprises/${id}/toggle-active/`).then((r) => r.data),

  setup: (data: EnterpriseSetupPayload) =>
    apiClient.post<EnterpriseSetupResponse>('enterprises/setup/', data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`enterprises/${id}/`).then((r) => r.data),

  reset: (id: string, data: EnterpriseResetPayload) =>
    apiClient.post<EnterpriseResetResponse>(`enterprises/${id}/reset/`, data).then((r) => r.data),
};

export const enterpriseSubscriptionApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<EnterpriseSubscription>>('enterprise-subscriptions/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<EnterpriseSubscription>(`enterprise-subscriptions/${id}/`).then((r) => r.data),

  create: (data: EnterpriseSubscriptionPayload) =>
    apiClient.post<EnterpriseSubscription>('enterprise-subscriptions/', data).then((r) => r.data),

  update: (id: string, data: Partial<EnterpriseSubscriptionPayload>) =>
    apiClient.patch<EnterpriseSubscription>(`enterprise-subscriptions/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`enterprise-subscriptions/${id}/`).then((r) => r.data),
};

export const billingApi = {
  modules: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<BillingModule>>('billing-modules/', { params }).then((r) => r.data),

  plans: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<BillingPlan>>('billing-plans/', { params }).then((r) => r.data),

  assignments: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<EnterprisePlanAssignment>>('enterprise-plan-assignments/', { params }).then((r) => r.data),

  currentAssignment: (params?: { enterprise?: string }) =>
    apiClient.get<EnterprisePlanCurrentResponse>('enterprise-plan-assignments/current/', { params }).then((r) => r.data),

  createAssignment: (data: {
    enterprise?: string;
    plan: string;
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    starts_on: string;
    ends_on?: string | null;
    auto_renew?: boolean;
    source_subscription?: string | null;
  }) => apiClient.post<EnterprisePlanAssignment>('enterprise-plan-assignments/', data).then((r) => r.data),

  updateAssignment: (id: string, data: Partial<{
    enterprise: string;
    plan: string;
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    starts_on: string;
    ends_on: string | null;
    auto_renew: boolean;
    source_subscription: string | null;
  }>) => apiClient.patch<EnterprisePlanAssignment>(`enterprise-plan-assignments/${id}/`, data).then((r) => r.data),

  deleteAssignment: (id: string) =>
    apiClient.delete(`enterprise-plan-assignments/${id}/`).then((r) => r.data),

  storeMatrix: (params: { store: string }) =>
    apiClient.get<StoreModuleMatrixResponse>('store-module-entitlements/matrix/', { params }).then((r) => r.data),

  bulkUpsertStoreEntitlements: (data: {
    store: string;
    overrides: Array<{ module_code: string; state: ModuleEntitlementState; reason?: string }>;
  }) => apiClient.post<StoreModuleMatrixResponse>('store-module-entitlements/bulk-upsert/', data).then((r) => r.data),

  storeEntitlements: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<StoreModuleEntitlement>>('store-module-entitlements/', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Analytics (Advanced / AI)
// ---------------------------------------------------------------------------

export const analyticsApi = {
  strategicKpis: (params: { store: string; date_from?: string; date_to?: string; refresh?: '0' | '1' }) =>
    apiClient.get<StrategicKPIs>('analytics/strategic-kpis/', { params }).then((r) => r.data),

  abc: (params: { store: string; date_from?: string; date_to?: string; refresh?: '0' | '1' }) =>
    apiClient.get('analytics/abc/', { params }).then((r) => r.data),

  reorder: (params: { store: string; as_of?: string; refresh?: '0' | '1' }) =>
    apiClient.get('analytics/reorder/', { params }).then((r) => r.data),

  creditScores: (params: { store: string; as_of?: string; refresh?: '0' | '1' }) =>
    apiClient.get('analytics/credit-scores/', { params }).then((r) => r.data),

  forecast: (params: { store: string; horizon_days?: string; refresh?: '0' | '1' }) =>
    apiClient.get('analytics/forecast/', { params }).then((r) => r.data),

  fraudEvents: (params: { store: string; date_from?: string; date_to?: string; status?: 'open' | 'resolved'; refresh?: '0' | '1' }) =>
    apiClient.get('analytics/fraud-events/', { params }).then((r) => r.data),

  forecastSummary: (params: { store: string; horizon_days?: string; refresh?: '0' | '1' }) =>
    apiClient.get<ForecastSummary>('analytics/forecast-summary/', { params }).then((r) => r.data),

  marginMovers: (params: { store: string; date_from?: string; date_to?: string; limit?: string; min_qty?: string }) =>
    apiClient.get<MarginMoversResponse>('analytics/margin-movers/', { params }).then((r) => r.data),

  orientationAdvice: (params: { store: string; date_from?: string; date_to?: string; focus_limit?: string }) =>
    apiClient.get<OrientationAdvice>('analytics/orientation/', { params }).then((r) => r.data),

  customerScore: (customerId: string, params: { store: string; as_of?: string }) =>
    apiClient.get<CustomerScoreResponse>(`analytics/customers/${customerId}/score/`, { params }).then((r) => r.data),

  customerCreditRisk: (params: { store: string; as_of?: string; min_score?: string; limit?: string }) =>
    apiClient.get<CustomerCreditRiskListResponse>('analytics/customers/credit-risk/', { params }).then((r) => r.data),

  customerCreditRiskForCustomer: (customerId: string, params: { store: string; as_of?: string }) =>
    apiClient
      .get<CustomerCreditRiskResponse>('analytics/customers/credit-risk/', {
        params: { ...params, customer_id: customerId },
      })
      .then((r) => r.data),

  customerRecommendations: (
    customerId: string,
    params: {
      store: string;
      as_of?: string;
      window_days?: string;
      limit?: string;
      include_only_in_stock?: '0' | '1';
      refresh?: '0' | '1';
    },
  ) =>
    apiClient
      .get<CustomerRecommendationsResponse>(`analytics/customers/${customerId}/recommendations/`, { params })
      .then((r) => r.data),

  customerNextOrder: (customerId: string, params: { store: string; as_of?: string }) =>
    apiClient.get<CustomerNextOrderResponse>(`analytics/customers/${customerId}/next-order/`, { params }).then((r) => r.data),

  customerChurnRisk: (
    params: {
      store: string;
      as_of?: string;
      window_days?: string;
      drop_threshold_pct?: string;
      limit?: string;
    },
  ) => apiClient.get<CustomerChurnRiskListResponse>('analytics/customers/churn-risk/', { params }).then((r) => r.data),

  customerTopMonthly: (params: { store: string; period?: string; limit?: string; refresh?: '0' | '1' }) =>
    apiClient.get<CustomerTopClientsResponse>('analytics/customers/top/', { params }).then((r) => r.data),

  customerDormant: (params: { store: string; as_of?: string; days?: string; limit?: string }) =>
    apiClient.get<CustomerDormantResponse>('analytics/customers/dormant/', { params }).then((r) => r.data),

  customerInsights: (params: { store: string; period?: string; limit?: string; as_of?: string }) =>
    apiClient.get<CustomerInsightsResponse>('analytics/customers/insights/', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categoryApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Category>>('categories/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Category>(`categories/${id}/`).then((r) => r.data),

  create: (data: Partial<Category>) =>
    apiClient.post<Category>('categories/', data).then((r) => r.data),

  update: (id: string, data: Partial<Category>) =>
    apiClient.patch<Category>(`categories/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`categories/${id}/`),

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CsvImportResult>('categories/import-csv/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export const brandApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Brand>>('brands/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Brand>(`brands/${id}/`).then((r) => r.data),

  create: (data: Partial<Brand>) =>
    apiClient.post<Brand>('brands/', data).then((r) => r.data),

  update: (id: string, data: Partial<Brand>) =>
    apiClient.patch<Brand>(`brands/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`brands/${id}/`),

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CsvImportResult>('brands/import-csv/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export const productApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Product>>('products/', { params }).then((r) => r.data),

  available: (params: Record<string, string>) =>
    apiClient.get<PaginatedResponse<PosProduct>>('products/available/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Product>(`products/${id}/`).then((r) => r.data),

  create: (data: FormData) =>
    apiClient.post<Product>('products/', data).then((r) => r.data),

  update: (id: string, data: Partial<Product> | FormData) =>
    apiClient.patch<Product>(`products/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`products/${id}/`),

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CsvImportResult>('products/import-csv/', fd).then((r) => r.data);
  },

  uploadImage: (productId: string, file: File, isPrimary = false) => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('is_primary', String(isPrimary));
    return apiClient.post<{ id: string; image: string; is_primary: boolean; sort_order: number }>(
      `products/${productId}/upload-image/`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },

  deleteImage: (productId: string, imageId: string) =>
    apiClient.post(`products/${productId}/delete-image/`, { image_id: imageId }),
};

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export const stockApi = {
  // Stock levels
  levels: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<ProductStock>>('stock/', { params }).then((r) => r.data),

  // Movements
  movements: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<InventoryMovement>>('stock-movements/', { params }).then((r) => r.data),

  createMovement: (data: Partial<InventoryMovement>) =>
    apiClient.post<InventoryMovement>('stock-movements/', data).then((r) => r.data),

  bulkEntry: (data: { store_id: string; entries: { product_id: string; quantity: number }[]; reference?: string; reason?: string }) =>
    apiClient.post<{ batch_id: string; count: number }>('stock-movements/bulk-entry/', data).then((r) => r.data),

  bulkAdjust: (data: { store_id: string; adjustments: { product_id: string; quantity: number }[]; reason: string }) =>
    apiClient.post<{ batch_id: string; count: number }>('stock-movements/bulk-adjust/', data).then((r) => r.data),

  movementDocument: (batchId: string) =>
    apiClient.get<MovementDocument>('stock-movements/document/', { params: { batch_id: batchId } }).then((r) => r.data),

  // Transfers
  transfers: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<StockTransfer>>('stock-transfers/', { params }).then((r) => r.data),

  getTransfer: (id: string) =>
    apiClient.get<StockTransfer>(`stock-transfers/${id}/`).then((r) => r.data),

  createTransfer: (data: { from_store_id: string; to_store: string; notes?: string; lines: { product_id: string; quantity: number }[] }) =>
    apiClient.post<StockTransfer>('stock-transfers/', data).then((r) => r.data),

  approveTransfer: (id: string) =>
    apiClient.post<StockTransfer>(`stock-transfers/${id}/approve/`).then((r) => r.data),

  receiveTransfer: (id: string) =>
    apiClient.post<StockTransfer>(`stock-transfers/${id}/receive/`).then((r) => r.data),

  // Inventory Counts
  counts: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<StockCount>>('stock-counts/', { params }).then((r) => r.data),

  getCount: (id: string) =>
    apiClient.get<StockCount>(`stock-counts/${id}/`).then((r) => r.data),

  createCount: (data: { store_id: string; notes?: string }) =>
    apiClient.post<StockCount>('stock-counts/', data).then((r) => r.data),

  updateCountLines: (id: string, data: { lines: { id: string; counted_qty: number }[] }) =>
    apiClient.patch<StockCount>(`stock-counts/${id}/update-lines/`, data).then((r) => r.data),

  completeCount: (id: string) =>
    apiClient.post<StockCount>(`stock-counts/${id}/complete/`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customerApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Customer>>('customers/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Customer>(`customers/${id}/`).then((r) => r.data),

  create: (data: Partial<Customer>) =>
    apiClient.post<Customer>('customers/', data).then((r) => r.data),

  update: (id: string, data: Partial<Customer>) =>
    apiClient.patch<Customer>(`customers/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`customers/${id}/`),

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CsvImportResult>('customers/import-csv/', fd).then((r) => r.data);
  },
};

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const saleApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Sale>>('sales/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Sale>(`sales/${id}/`).then((r) => r.data),

  create: (data: { store_id: string; customer_id?: string; discount_percent?: string; notes?: string }) =>
    apiClient.post<Sale>('sales/', data).then((r) => r.data),

  addItem: (saleId: string, data: { product_id: string; quantity: number; discount_amount?: string; unit_price_override?: string }) =>
    apiClient.post<Sale>(`sales/${saleId}/add-item/`, data).then((r) => r.data),

  setItemQuantity: (saleId: string, data: { item_id: string; quantity: number }) =>
    apiClient.post<Sale>(`sales/${saleId}/set-item-quantity/`, data).then((r) => r.data),

  setItemUnitPrice: (saleId: string, data: { item_id: string; unit_price: string }) =>
    apiClient.post<Sale>(`sales/${saleId}/set-item-unit-price/`, data).then((r) => r.data),

  removeItem: (saleId: string, itemId: string) =>
    apiClient.post<Sale>(`sales/${saleId}/remove-item/`, { item_id: itemId }).then((r) => r.data),

  submit: (saleId: string) =>
    apiClient.post<Sale>(`sales/${saleId}/submit/`).then((r) => r.data),

  update: (saleId: string, data: Record<string, string>) =>
    apiClient.patch<Sale>(`sales/${saleId}/`, data).then((r) => r.data),

  cancel: (saleId: string, reason: string) =>
    apiClient.post<Sale>(`sales/${saleId}/cancel/`, { reason }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Quotes (Devis)
// ---------------------------------------------------------------------------

export const quoteApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Quote>>('quotes/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Quote>(`quotes/${id}/`).then((r) => r.data),

  create: (data: { store_id: string; customer_id?: string; document_type?: string; discount_percent?: string; notes?: string; conditions?: string; valid_until?: string }) =>
    apiClient.post<Quote>('quotes/', data).then((r) => r.data),

  update: (id: string, data: Partial<{ customer: string; discount_percent: string; discount_amount: string; notes: string; conditions: string; valid_until: string }>) =>
    apiClient.patch<Quote>(`quotes/${id}/`, data).then((r) => r.data),

  addItem: (quoteId: string, data: { product_id: string; quantity: number; discount_amount?: string; unit_price_override?: string }) =>
    apiClient.post<Quote>(`quotes/${quoteId}/add-item/`, data).then((r) => r.data),

  removeItem: (quoteId: string, itemId: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/remove-item/`, { item_id: itemId }).then((r) => r.data),

  send: (quoteId: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/send/`).then((r) => r.data),

  accept: (quoteId: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/accept/`).then((r) => r.data),

  refuse: (quoteId: string, reason: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/refuse/`, { reason }).then((r) => r.data),

  convert: (quoteId: string) =>
    apiClient.post<Sale>(`quotes/${quoteId}/convert/`).then((r) => r.data),

  cancel: (quoteId: string, reason: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/cancel/`, { reason }).then((r) => r.data),

  duplicate: (quoteId: string) =>
    apiClient.post<Quote>(`quotes/${quoteId}/duplicate/`).then((r) => r.data),

  delete: (quoteId: string) =>
    apiClient.delete(`quotes/${quoteId}/`),
};

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Payment>>('payments/', { params }).then((r) => r.data),

  create: (data: { sale_id: string; payments: Array<{ method: string; amount: string; reference?: string }> }) =>
    apiClient.post<Payment[]>('payments/', data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Cash Shifts
// ---------------------------------------------------------------------------

export const cashShiftApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<CashShift>>('cash-shifts/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<CashShift>(`cash-shifts/${id}/`).then((r) => r.data),

  current: (storeId?: string) =>
    apiClient.get<CashShift>('cash-shifts/current/', { params: storeId ? { store: storeId } : undefined }).then((r) => r.data),

  open: (data: { store: string; opening_float: string }) =>
    apiClient.post<CashShift>('cash-shifts/open/', data).then((r) => r.data),

  close: (shiftId: string, data: { closing_cash: string; notes?: string }) =>
    apiClient.post<CashShift>(`cash-shifts/${shiftId}/close/`, data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export const creditApi = {
  accounts: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<CustomerAccount>>('credit-accounts/', { params }).then((r) => r.data),

  getAccount: (id: string) =>
    apiClient.get<CustomerAccount>(`credit-accounts/${id}/`).then((r) => r.data),

  ledger: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<CreditLedgerEntry>>('credit-ledger/', { params }).then((r) => r.data),

  pay: (accountId: string, data: { amount: string; reference?: string }) =>
    apiClient.post<CreditPaymentResult>(`credit-accounts/${accountId}/pay/`, data).then((r) => r.data),

  schedules: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<PaymentSchedule>>('payment-schedules/', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const expenseApi = {
  categories: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<ExpenseCategory>>('expense-categories/', { params }).then((r) => r.data),

  createCategory: (data: { store?: string; name: string; type: 'STOCK' | 'FIXED' | 'VARIABLE' }) =>
    apiClient.post<ExpenseCategory>('expense-categories/', data).then((r) => r.data),

  updateCategory: (id: string, data: Partial<ExpenseCategory>) =>
    apiClient.patch<ExpenseCategory>(`expense-categories/${id}/`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    apiClient.delete(`expense-categories/${id}/`).then((r) => r.data),

  wallets: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Wallet>>('wallets/', { params }).then((r) => r.data),

  createWallet: (data: { store: string; name: string; type: 'CASH' | 'BANK' | 'MOBILE_MONEY'; initial_balance?: string }) =>
    apiClient.post<Wallet>('wallets/', data).then((r) => r.data),

  updateWallet: (id: string, data: Partial<Wallet> & { new_balance?: string }) =>
    apiClient.patch<Wallet>(`wallets/${id}/`, data).then((r) => r.data),

  deleteWallet: (id: string) =>
    apiClient.delete(`wallets/${id}/`).then((r) => r.data),

  expenses: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Expense>>('expenses/', { params }).then((r) => r.data),

  createExpense: (data: {
    store: string;
    category: string;
    wallet: string;
    amount: string;
    description: string;
    supplier_name?: string;
    expense_date: string;
  }) => apiClient.post<Expense>('expenses/', data).then((r) => r.data),

  updateExpense: (id: string, data: Partial<Expense>) =>
    apiClient.patch<Expense>(`expenses/${id}/`, data).then((r) => r.data),

  voidExpense: (id: string, reason?: string) =>
    apiClient.post<Expense>(`expenses/${id}/void/`, reason ? { reason } : {}).then((r) => r.data),

  budgets: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<ExpenseBudget>>('expense-budgets/', { params }).then((r) => r.data),

  createBudget: (data: {
    store: string;
    category?: string | null;
    period: string;
    limit_amount: string;
    alert_threshold_percent: number;
  }) => apiClient.post<ExpenseBudget>('expense-budgets/', data).then((r) => r.data),

  updateBudget: (id: string, data: Partial<ExpenseBudget>) =>
    apiClient.patch<ExpenseBudget>(`expense-budgets/${id}/`, data).then((r) => r.data),

  deleteBudget: (id: string) =>
    apiClient.delete(`expense-budgets/${id}/`).then((r) => r.data),

  recurring: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<RecurringExpense>>('recurring-expenses/', { params }).then((r) => r.data),

  createRecurring: (data: {
    store: string;
    category: string;
    wallet: string;
    amount: string;
    description: string;
    supplier_name?: string;
    frequency: 'WEEKLY' | 'MONTHLY';
    next_run_date: string;
  }) => apiClient.post<RecurringExpense>('recurring-expenses/', data).then((r) => r.data),

  updateRecurring: (id: string, data: Partial<RecurringExpense>) =>
    apiClient.patch<RecurringExpense>(`recurring-expenses/${id}/`, data).then((r) => r.data),

  deleteRecurring: (id: string) =>
    apiClient.delete(`recurring-expenses/${id}/`).then((r) => r.data),

  runRecurringDue: (data?: { store?: string; run_date?: string }) =>
    apiClient.post<{ generated_count: number; generated_ids: string[]; failed_count: number; failures: Array<{ recurring_id: string; store_id: string; error: string }> }>(
      'recurring-expenses/run_due/', data ?? {},
    ).then((r) => r.data),

  dashboard: (params: { store: string; period?: string }) =>
    apiClient.get<ExpenseDashboardData>('expenses/dashboard/', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export const supplierApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Supplier>>('suppliers/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Supplier>(`suppliers/${id}/`).then((r) => r.data),

  create: (data: Partial<Supplier>) =>
    apiClient.post<Supplier>('suppliers/', data).then((r) => r.data),

  update: (id: string, data: Partial<Supplier>) =>
    apiClient.patch<Supplier>(`suppliers/${id}/`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`suppliers/${id}/`),
};

export const purchaseOrderApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<PurchaseOrder>>('purchase-orders/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<PurchaseOrder>(`purchase-orders/${id}/`).then((r) => r.data),

  create: (data: PurchaseOrderCreatePayload) =>
    apiClient.post<PurchaseOrder>('purchase-orders/', data).then((r) => r.data),

  update: (id: string, data: PurchaseOrderUpdatePayload) =>
    apiClient.patch<PurchaseOrder>(`purchase-orders/${id}/`, data).then((r) => r.data),

  submit: (id: string) =>
    apiClient.post<PurchaseOrder>(`purchase-orders/${id}/submit/`).then((r) => r.data),

  cancel: (id: string, reason?: string) =>
    apiClient.post<PurchaseOrder>(`purchase-orders/${id}/cancel/`, reason ? { reason } : {}).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`purchase-orders/${id}/`).then((r) => r.data),
};

export const goodsReceiptApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<GoodsReceipt>>('goods-receipts/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<GoodsReceipt>(`goods-receipts/${id}/`).then((r) => r.data),

  create: (data: GoodsReceiptCreatePayload) =>
    apiClient.post<GoodsReceipt>('goods-receipts/', data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const alertApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Alert>>('alerts/', { params }).then((r) => r.data),

  markRead: (id: string) =>
    apiClient.post<Alert>(`alerts/${id}/mark-read/`).then((r) => r.data),

  markAllRead: () =>
    apiClient.post('alerts/mark-all-read/').then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Reports / KPIs
// ---------------------------------------------------------------------------

export const reportApi = {
  kpis: (params: { store: string; date_from?: string; date_to?: string }) =>
    apiClient.get<KPIData>('reports/kpis/', { params }).then((r) => r.data),

  sales: (
    params: {
      store: string;
      date_from?: string;
      date_to?: string;
      group_by?: string;
      customer?: string;
      cashier?: string;
      product?: string;
    },
  ) =>
    apiClient.get<SalesReport>('reports/sales/', { params }).then((r) => r.data),

  cashierOperationsPdf: (
    params: {
      store: string;
      date_from?: string;
      date_to?: string;
      customer?: string;
      cashier?: string;
      product?: string;
    },
  ) =>
    apiClient
      .get<Blob>('reports/cashier-operations/pdf/', { params, responseType: 'blob' })
      .then((r) => r.data),

  stockTrend: (params: { store: string; date_from?: string; date_to?: string }) =>
    apiClient.get<StockValueTrend>('reports/stock-trend/', { params }).then((r) => r.data),

  dailyStatistics: (params: { store: string; date_from?: string; date_to?: string }) =>
    apiClient.get<DailyStatistics>('reports/daily-statistics/', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

function normalizeListPayload<T>(payload: T[] | PaginatedResponse<T> | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

export const objectiveApi = {
  // Rules
  listRules: (params?: { store?: string }) =>
    apiClient
      .get<ObjectiveRule[] | PaginatedResponse<ObjectiveRule>>('objective-rules/', { params })
      .then((r) => normalizeListPayload<ObjectiveRule>(r.data)),
  getRule: (id: string) =>
    apiClient.get<ObjectiveRule>(`objective-rules/${id}/`).then((r) => r.data),
  createRule: (data: Partial<ObjectiveRule>, params?: { store?: string }) =>
    apiClient.post<ObjectiveRule>('objective-rules/', data, { params }).then((r) => r.data),
  updateRule: (id: string, data: Partial<ObjectiveRule>, params?: { store?: string }) =>
    apiClient.put<ObjectiveRule>(`objective-rules/${id}/`, data, { params }).then((r) => r.data),
  deleteRule: (id: string, params?: { store?: string }) =>
    apiClient.delete(`objective-rules/${id}/`, { params }).then((r) => r.data),

  // Seller dashboard
  dashboard: (params?: { period?: string; store?: string }) =>
    apiClient.get<SellerDashboard>('objectives/seller/dashboard/', { params }).then((r) => r.data),

  // Seller history
  history: (params?: { year?: string; store?: string }) =>
    apiClient.get<SellerHistoryMonth[]>('objectives/seller/history/', { params }).then((r) => r.data),

  // My badges
  myBadges: (params?: { store?: string }) =>
    apiClient.get<SellerBadge[]>('objectives/seller/badges/', { params }).then((r) => r.data),

  // Leaderboard
  leaderboard: (params?: { period?: string; store?: string }) =>
    apiClient.get<LeaderboardData>('objectives/leaderboard/', { params }).then((r) => r.data),
  leaderboardSettings: (params?: { store?: string }) =>
    apiClient.get<LeaderboardSettings>('objectives/leaderboard/settings/', { params }).then((r) => r.data),
  updateLeaderboardSettings: (
    data: Partial<LeaderboardSettings>,
    params?: { store?: string },
  ) =>
    apiClient.patch<LeaderboardSettings>('objectives/leaderboard/settings/', data, { params }).then((r) => r.data),

  // Admin stats
  adminStats: (params?: { period?: string; store?: string }) =>
    apiClient
      .get<SellerMonthlyStats[] | PaginatedResponse<SellerMonthlyStats>>('objectives/admin/stats/', { params })
      .then((r) => normalizeListPayload<SellerMonthlyStats>(r.data)),

  // Penalty types
  listPenaltyTypes: (params?: { store?: string }) =>
    apiClient
      .get<SellerPenaltyType[] | PaginatedResponse<SellerPenaltyType>>('objective-penalty-types/', { params })
      .then((r) => normalizeListPayload<SellerPenaltyType>(r.data)),
  createPenaltyType: (data: Partial<SellerPenaltyType>, params?: { store?: string }) =>
    apiClient.post<SellerPenaltyType>('objective-penalty-types/', data, { params }).then((r) => r.data),
  updatePenaltyType: (id: string, data: Partial<SellerPenaltyType>, params?: { store?: string }) =>
    apiClient.patch<SellerPenaltyType>(`objective-penalty-types/${id}/`, data, { params }).then((r) => r.data),

  // Penalties
  listPenalties: (params?: { period?: string; seller_id?: string; store?: string }) =>
    apiClient
      .get<SellerPenalty[] | PaginatedResponse<SellerPenalty>>('objective-penalties/', { params })
      .then((r) => normalizeListPayload<SellerPenalty>(r.data)),
  createPenalty: (data: Partial<SellerPenalty>, params?: { store?: string }) =>
    apiClient.post<SellerPenalty>('objective-penalties/', data, { params }).then((r) => r.data),
  voidPenalty: (id: string, params?: { store?: string }) =>
    apiClient.post(`objective-penalties/${id}/void/`, {}, { params }).then((r) => r.data),

  // Sprints
  listSprints: (params?: { store?: string }) =>
    apiClient
      .get<SellerSprint[] | PaginatedResponse<SellerSprint>>('objective-sprints/', { params })
      .then((r) => normalizeListPayload<SellerSprint>(r.data)),
  createSprint: (data: Partial<SellerSprint>, params?: { store?: string }) =>
    apiClient.post<SellerSprint>('objective-sprints/', data, { params }).then((r) => r.data),
  currentSprint: (params?: { store?: string }) =>
    apiClient.get<SellerSprint>('objective-sprints/current/', { params }).then((r) => r.data),

  // Admin seller objectives list
  listSellerObjectives: (params?: { period?: string; store?: string }) =>
    apiClient
      .get<PaginatedResponse<any> | any[]>('seller-objectives/', { params })
      .then((r) => normalizeListPayload<any>(r.data)),

  // Recompute
  recompute: (data: { period?: string; seller_id?: string; store?: string }) =>
    apiClient.post('objectives/recompute/', data).then((r) => r.data),

  // Multi-period ranking
  ranking: (params?: { period?: string; store?: string }) =>
    apiClient.get<MultiPeriodRanking>('objectives/seller/ranking/', { params }).then((r) => r.data),

  // Credit quality
  creditQuality: (params?: { period?: string; store?: string }) =>
    apiClient.get<CreditQuality>('objectives/seller/credit-quality/', { params }).then((r) => r.data),

  // Product mix
  productMix: (params?: { period?: string; store?: string }) =>
    apiClient.get<ProductMix>('objectives/seller/product-mix/', { params }).then((r) => r.data),

  // Coaching missions
  coaching: (params?: { period?: string; store?: string }) =>
    apiClient.get<CoachingData>('objectives/seller/coaching/', { params }).then((r) => r.data),
};

export const cashierAnalyticsApi = {
  dashboard: (params?: Record<string, string>) =>
    apiClient.get<CashierDashboardData>('cashier-analytics/dashboard/', { params }).then((r) => r.data),
  team: (params?: Record<string, string>) =>
    apiClient.get<CashierTeamData>('cashier-analytics/team/', { params }).then((r) => r.data),
};
export const stockAnalyticsApi = {
  dashboard: (params?: { store?: string; period?: string }) =>
    apiClient.get<StockDashboardData>('stock-analytics/dashboard/', { params }).then(r => r.data),
  alerts: (params?: { store?: string }) =>
    apiClient.get<StockAlertsData>('stock-analytics/alerts/', { params }).then(r => r.data),
};

export const dgApi = {
  dashboard: (params?: { store?: string; period?: string }) =>
    apiClient.get<DGDashboardData>('dg/dashboard/', { params }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// HRM
// ---------------------------------------------------------------------------

export const hrmApi = {
  // Departments
  departments: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmDepartment>>('hrm/departments/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmDepartment>(`hrm/departments/${id}/`).then(r => r.data),
    create: (data: Partial<HrmDepartment>) =>
      apiClient.post<HrmDepartment>('hrm/departments/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmDepartment>) =>
      apiClient.patch<HrmDepartment>(`hrm/departments/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/departments/${id}/`),
  },

  // Positions
  positions: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPosition>>('hrm/positions/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmPosition>(`hrm/positions/${id}/`).then(r => r.data),
    create: (data: Partial<HrmPosition>) =>
      apiClient.post<HrmPosition>('hrm/positions/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPosition>) =>
      apiClient.patch<HrmPosition>(`hrm/positions/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/positions/${id}/`),
  },

  // Employees
  employees: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmEmployeeList>>('hrm/employees/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmEmployee>(`hrm/employees/${id}/`).then(r => r.data),
    create: (data: Partial<HrmEmployee>) =>
      apiClient.post<HrmEmployee>('hrm/employees/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmEmployee>) =>
      apiClient.patch<HrmEmployee>(`hrm/employees/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/employees/${id}/`),
  },

  // Contracts
  contracts: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmContract>>('hrm/contracts/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmContract>(`hrm/contracts/${id}/`).then(r => r.data),
    create: (data: Partial<HrmContract>) =>
      apiClient.post<HrmContract>('hrm/contracts/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmContract>) =>
      apiClient.patch<HrmContract>(`hrm/contracts/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/contracts/${id}/`),
  },

  // Attendance policies
  attendancePolicies: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmAttendancePolicy>>('hrm/attendance-policies/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmAttendancePolicy>(`hrm/attendance-policies/${id}/`).then(r => r.data),
    create: (data: Partial<HrmAttendancePolicy>) =>
      apiClient.post<HrmAttendancePolicy>('hrm/attendance-policies/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmAttendancePolicy>) =>
      apiClient.patch<HrmAttendancePolicy>(`hrm/attendance-policies/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/attendance-policies/${id}/`),
  },

  // Attendances
  attendances: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmAttendance>>('hrm/attendances/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmAttendance>(`hrm/attendances/${id}/`).then(r => r.data),
    create: (data: Partial<HrmAttendance>) =>
      apiClient.post<HrmAttendance>('hrm/attendances/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmAttendance>) =>
      apiClient.patch<HrmAttendance>(`hrm/attendances/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/attendances/${id}/`),
    bulkCheckin: (data: { employee_ids: string[]; date: string; check_in?: string }) =>
      apiClient.post('hrm/attendances/bulk-checkin/', data).then(r => r.data),
  },

  // Leave types
  leaveTypes: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmLeaveType>>('hrm/leave-types/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmLeaveType>(`hrm/leave-types/${id}/`).then(r => r.data),
    create: (data: Partial<HrmLeaveType>) =>
      apiClient.post<HrmLeaveType>('hrm/leave-types/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmLeaveType>) =>
      apiClient.patch<HrmLeaveType>(`hrm/leave-types/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/leave-types/${id}/`),
  },

  // Leave balances
  leaveBalances: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmLeaveBalance>>('hrm/leave-balances/', { params }).then(r => r.data),
    create: (data: Partial<HrmLeaveBalance>) =>
      apiClient.post<HrmLeaveBalance>('hrm/leave-balances/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmLeaveBalance>) =>
      apiClient.patch<HrmLeaveBalance>(`hrm/leave-balances/${id}/`, data).then(r => r.data),
  },

  // Leave requests
  leaveRequests: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmLeaveRequest>>('hrm/leave-requests/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmLeaveRequest>(`hrm/leave-requests/${id}/`).then(r => r.data),
    create: (data: Partial<HrmLeaveRequest>) =>
      apiClient.post<HrmLeaveRequest>('hrm/leave-requests/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmLeaveRequest>) =>
      apiClient.patch<HrmLeaveRequest>(`hrm/leave-requests/${id}/`, data).then(r => r.data),
    approve: (id: string, comment?: string) =>
      apiClient.post<HrmLeaveRequest>(`hrm/leave-requests/${id}/approve/`, { comment }).then(r => r.data),
    reject: (id: string, comment?: string) =>
      apiClient.post<HrmLeaveRequest>(`hrm/leave-requests/${id}/reject/`, { comment }).then(r => r.data),
  },

  // Payroll periods
  payrollPeriods: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPayrollPeriod>>('hrm/payroll-periods/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmPayrollPeriod>(`hrm/payroll-periods/${id}/`).then(r => r.data),
    create: (data: Partial<HrmPayrollPeriod>) =>
      apiClient.post<HrmPayrollPeriod>('hrm/payroll-periods/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPayrollPeriod>) =>
      apiClient.patch<HrmPayrollPeriod>(`hrm/payroll-periods/${id}/`, data).then(r => r.data),
    close: (id: string) =>
      apiClient.post<HrmPayrollPeriod>(`hrm/payroll-periods/${id}/close/`).then(r => r.data),
    generatePayslips: (id: string) =>
      apiClient.post(`hrm/payroll-periods/${id}/generate-payslips/`).then(r => r.data),
  },

  // Payslips
  payslips: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPaySlip>>('hrm/payslips/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmPaySlip>(`hrm/payslips/${id}/`).then(r => r.data),
    create: (data: Partial<HrmPaySlip>) =>
      apiClient.post<HrmPaySlip>('hrm/payslips/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPaySlip>) =>
      apiClient.patch<HrmPaySlip>(`hrm/payslips/${id}/`, data).then(r => r.data),
    validate: (id: string) =>
      apiClient.post<HrmPaySlip>(`hrm/payslips/${id}/validate_slip/`).then(r => r.data),
    markPaid: (id: string) =>
      apiClient.post<HrmPaySlip>(`hrm/payslips/${id}/mark-paid/`).then(r => r.data),
    compute: (id: string) =>
      apiClient.post<HrmPaySlip>(`hrm/payslips/${id}/compute/`).then(r => r.data),
  },

  // Payslip lines
  payslipLines: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPaySlipLine>>('hrm/payslip-lines/', { params }).then(r => r.data),
    create: (data: Partial<HrmPaySlipLine>) =>
      apiClient.post<HrmPaySlipLine>('hrm/payslip-lines/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPaySlipLine>) =>
      apiClient.patch<HrmPaySlipLine>(`hrm/payslip-lines/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/payslip-lines/${id}/`),
  },

  // Salary components
  salaryComponents: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmSalaryComponent>>('hrm/salary-components/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmSalaryComponent>(`hrm/salary-components/${id}/`).then(r => r.data),
    create: (data: Partial<HrmSalaryComponent>) =>
      apiClient.post<HrmSalaryComponent>('hrm/salary-components/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmSalaryComponent>) =>
      apiClient.patch<HrmSalaryComponent>(`hrm/salary-components/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/salary-components/${id}/`),
  },

  // Employee salary components
  employeeSalaryComponents: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmEmployeeSalaryComponent>>('hrm/employee-salary-components/', { params }).then(r => r.data),
    create: (data: Partial<HrmEmployeeSalaryComponent>) =>
      apiClient.post<HrmEmployeeSalaryComponent>('hrm/employee-salary-components/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmEmployeeSalaryComponent>) =>
      apiClient.patch<HrmEmployeeSalaryComponent>(`hrm/employee-salary-components/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/employee-salary-components/${id}/`),
  },

  // Evaluation templates
  evaluationTemplates: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmEvaluationTemplate>>('hrm/evaluation-templates/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmEvaluationTemplate>(`hrm/evaluation-templates/${id}/`).then(r => r.data),
    create: (data: Partial<HrmEvaluationTemplate>) =>
      apiClient.post<HrmEvaluationTemplate>('hrm/evaluation-templates/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmEvaluationTemplate>) =>
      apiClient.patch<HrmEvaluationTemplate>(`hrm/evaluation-templates/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/evaluation-templates/${id}/`),
  },

  // Evaluation criteria
  evaluationCriteria: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmEvaluationCriteria>>('hrm/evaluation-criteria/', { params }).then(r => r.data),
    create: (data: Partial<HrmEvaluationCriteria>) =>
      apiClient.post<HrmEvaluationCriteria>('hrm/evaluation-criteria/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmEvaluationCriteria>) =>
      apiClient.patch<HrmEvaluationCriteria>(`hrm/evaluation-criteria/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/evaluation-criteria/${id}/`),
  },

  // Performance reviews
  performanceReviews: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPerformanceReview>>('hrm/performance-reviews/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmPerformanceReview>(`hrm/performance-reviews/${id}/`).then(r => r.data),
    create: (data: Partial<HrmPerformanceReview>) =>
      apiClient.post<HrmPerformanceReview>('hrm/performance-reviews/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPerformanceReview>) =>
      apiClient.patch<HrmPerformanceReview>(`hrm/performance-reviews/${id}/`, data).then(r => r.data),
    complete: (id: string) =>
      apiClient.post<HrmPerformanceReview>(`hrm/performance-reviews/${id}/complete/`).then(r => r.data),
  },

  // Performance scores
  performanceScores: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmPerformanceReviewScore>>('hrm/performance-scores/', { params }).then(r => r.data),
    create: (data: Partial<HrmPerformanceReviewScore>) =>
      apiClient.post<HrmPerformanceReviewScore>('hrm/performance-scores/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmPerformanceReviewScore>) =>
      apiClient.patch<HrmPerformanceReviewScore>(`hrm/performance-scores/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/performance-scores/${id}/`),
  },

  // Disciplinary actions
  disciplinaryActions: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmDisciplinaryAction>>('hrm/disciplinary-actions/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmDisciplinaryAction>(`hrm/disciplinary-actions/${id}/`).then(r => r.data),
    create: (data: Partial<HrmDisciplinaryAction>) =>
      apiClient.post<HrmDisciplinaryAction>('hrm/disciplinary-actions/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmDisciplinaryAction>) =>
      apiClient.patch<HrmDisciplinaryAction>(`hrm/disciplinary-actions/${id}/`, data).then(r => r.data),
  },

  // Documents
  documents: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmEmployeeDocument>>('hrm/documents/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmEmployeeDocument>(`hrm/documents/${id}/`).then(r => r.data),
    create: (data: FormData) =>
      apiClient.post<HrmEmployeeDocument>('hrm/documents/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/documents/${id}/`),
  },

  // Holidays
  holidays: {
    list: (params?: Record<string, string>) =>
      apiClient.get<PaginatedResponse<HrmHoliday>>('hrm/holidays/', { params }).then(r => r.data),
    get: (id: string) =>
      apiClient.get<HrmHoliday>(`hrm/holidays/${id}/`).then(r => r.data),
    create: (data: Partial<HrmHoliday>) =>
      apiClient.post<HrmHoliday>('hrm/holidays/', data).then(r => r.data),
    update: (id: string, data: Partial<HrmHoliday>) =>
      apiClient.patch<HrmHoliday>(`hrm/holidays/${id}/`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`hrm/holidays/${id}/`),
  },
};

// ---------------------------------------------------------------------------
// Public document verification (no auth required)
// ---------------------------------------------------------------------------

export const documentApi = {
  verify: (token: string) =>
    apiClient.get<DocumentVerification>(`documents/verify/${token}/`).then(r => r.data),
};
