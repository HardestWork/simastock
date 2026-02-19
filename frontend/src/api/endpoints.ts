/** Typed API endpoint functions organized by domain. */
import apiClient from './client';
import type {
  LoginCredentials,
  LoginResponse,
  User,
  CustomRole,
  MyStore,
  Enterprise,
  EnterpriseSetupPayload,
  EnterpriseSetupResponse,
  Store,
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
  CreditLedgerEntry,
  PaymentSchedule,
  Supplier,
  PurchaseOrder,
  GoodsReceipt,
  Alert,
  KPIData,
  SalesReport,
  StrategicKPIs,
  ForecastSummary,
  StockValueTrend,
  DailyStatistics,
  StoreUserRecord,
  CapabilityPreset,
  PaginatedResponse,
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

  create: (data: { store_id: string; customer_id?: string; discount_percent?: string; notes?: string; conditions?: string; valid_until?: string }) =>
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
    apiClient.post<CustomerAccount>(`credit-accounts/${accountId}/pay/`, data).then((r) => r.data),

  schedules: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<PaymentSchedule>>('payment-schedules/', { params }).then((r) => r.data),
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

  create: (data: Partial<PurchaseOrder>) =>
    apiClient.post<PurchaseOrder>('purchase-orders/', data).then((r) => r.data),

  update: (id: string, data: Partial<PurchaseOrder>) =>
    apiClient.patch<PurchaseOrder>(`purchase-orders/${id}/`, data).then((r) => r.data),
};

export const goodsReceiptApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<GoodsReceipt>>('goods-receipts/', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<GoodsReceipt>(`goods-receipts/${id}/`).then((r) => r.data),

  create: (data: Partial<GoodsReceipt>) =>
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

  sales: (params: { store: string; date_from?: string; date_to?: string; group_by?: string }) =>
    apiClient.get<SalesReport>('reports/sales/', { params }).then((r) => r.data),

  stockTrend: (params: { store: string; date_from?: string; date_to?: string }) =>
    apiClient.get<StockValueTrend>('reports/stock-trend/', { params }).then((r) => r.data),

  dailyStatistics: (params: { store: string; date_from?: string; date_to?: string }) =>
    apiClient.get<DailyStatistics>('reports/daily-statistics/', { params }).then((r) => r.data),
};
