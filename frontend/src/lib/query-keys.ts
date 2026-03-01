/** TanStack Query key factory — avoids magic strings throughout the app. */

export const queryKeys = {
  // Auth
  me: ['auth', 'me'] as const,

  // Users
  users: {
    all: ['users'] as const,
    list: (params?: Record<string, string>) => ['users', 'list', params] as const,
    detail: (id: string) => ['users', id] as const,
  },

  // Roles
  roles: {
    all: ['roles'] as const,
    list: (params?: Record<string, string>) => ['roles', 'list', params] as const,
    detail: (id: string) => ['roles', id] as const,
  },

  // Stores
  myStores: ['stores', 'my-stores'] as const,
  stores: {
    all: ['stores'] as const,
    detail: (id: string) => ['stores', id] as const,
  },

  // Enterprises
  enterprises: {
    all: ['enterprises'] as const,
    detail: (id: string) => ['enterprises', id] as const,
  },
  enterpriseSubscriptions: {
    all: ['enterprise-subscriptions'] as const,
    list: (params?: Record<string, string>) => ['enterprise-subscriptions', 'list', params] as const,
    detail: (id: string) => ['enterprise-subscriptions', id] as const,
  },
  billing: {
    modules: (params?: Record<string, string>) => ['billing', 'modules', params] as const,
    plans: (params?: Record<string, string>) => ['billing', 'plans', params] as const,
    assignments: (params?: Record<string, string>) => ['billing', 'assignments', params] as const,
    currentAssignment: (enterpriseId?: string) => ['billing', 'current-assignment', enterpriseId] as const,
    storeMatrix: (storeId?: string) => ['billing', 'store-matrix', storeId] as const,
  },

  // Catalog
  categories: {
    all: ['categories'] as const,
    list: (params?: Record<string, string>) => ['categories', 'list', params] as const,
    detail: (id: string) => ['categories', id] as const,
  },
  brands: {
    all: ['brands'] as const,
    list: (params?: Record<string, string>) => ['brands', 'list', params] as const,
    detail: (id: string) => ['brands', id] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params?: Record<string, string>) => ['products', 'list', params] as const,
    detail: (id: string) => ['products', id] as const,
  },

  // Stock
  stockLevels: {
    all: ['stock'] as const,
    list: (params?: Record<string, string>) => ['stock', 'list', params] as const,
  },
  stockMovements: {
    all: ['stock-movements'] as const,
    list: (params?: Record<string, string>) => ['stock-movements', 'list', params] as const,
    document: (batchId: string) => ['stock-movements', 'document', batchId] as const,
  },
  transfers: {
    all: ['stock-transfers'] as const,
    list: (params?: Record<string, string>) => ['stock-transfers', 'list', params] as const,
    detail: (id: string) => ['stock-transfers', id] as const,
  },
  counts: {
    all: ['stock-counts'] as const,
    list: (params?: Record<string, string>) => ['stock-counts', 'list', params] as const,
    detail: (id: string) => ['stock-counts', id] as const,
  },

  // Customers
  customers: {
    all: ['customers'] as const,
    list: (params?: Record<string, string>) => ['customers', 'list', params] as const,
    detail: (id: string) => ['customers', id] as const,
  },

  // Sales
  sales: {
    all: ['sales'] as const,
    list: (params?: Record<string, string>) => ['sales', 'list', params] as const,
    detail: (id: string) => ['sales', id] as const,
  },

  // Quotes (Devis)
  quotes: {
    all: ['quotes'] as const,
    list: (params?: Record<string, string>) => ['quotes', 'list', params] as const,
    detail: (id: string) => ['quotes', id] as const,
  },

  // Payments
  payments: {
    all: ['payments'] as const,
    list: (params?: Record<string, string>) => ['payments', 'list', params] as const,
  },

  // Cash Shifts
  cashShifts: {
    all: ['cash-shifts'] as const,
    list: (params?: Record<string, string>) => ['cash-shifts', 'list', params] as const,
    detail: (id: string) => ['cash-shifts', id] as const,
    current: (storeId?: string) => ['cash-shifts', 'current', storeId] as const,
  },

  // Credits
  creditAccounts: {
    all: ['credit-accounts'] as const,
    list: (params?: Record<string, string>) => ['credit-accounts', 'list', params] as const,
    detail: (id: string) => ['credit-accounts', id] as const,
  },
  creditLedger: {
    all: ['credit-ledger'] as const,
    list: (params?: Record<string, string>) => ['credit-ledger', 'list', params] as const,
  },
  paymentSchedules: {
    all: ['payment-schedules'] as const,
    list: (params?: Record<string, string>) => ['payment-schedules', 'list', params] as const,
  },

  // Expenses
  expenses: {
    all: ['expenses'] as const,
    list: (params?: Record<string, string>) => ['expenses', 'list', params] as const,
    detail: (id: string) => ['expenses', id] as const,
    dashboard: (storeId: string, period?: string) => ['expenses', 'dashboard', storeId, period] as const,
  },
  expenseCategories: {
    all: ['expense-categories'] as const,
    list: (params?: Record<string, string>) => ['expense-categories', 'list', params] as const,
  },
  wallets: {
    all: ['wallets'] as const,
    list: (params?: Record<string, string>) => ['wallets', 'list', params] as const,
  },
  expenseBudgets: {
    all: ['expense-budgets'] as const,
    list: (params?: Record<string, string>) => ['expense-budgets', 'list', params] as const,
  },
  recurringExpenses: {
    all: ['recurring-expenses'] as const,
    list: (params?: Record<string, string>) => ['recurring-expenses', 'list', params] as const,
  },

  // Purchases
  suppliers: {
    all: ['suppliers'] as const,
    list: (params?: Record<string, string>) => ['suppliers', 'list', params] as const,
    detail: (id: string) => ['suppliers', id] as const,
  },
  purchaseOrders: {
    all: ['purchase-orders'] as const,
    list: (params?: Record<string, string>) => ['purchase-orders', 'list', params] as const,
    detail: (id: string) => ['purchase-orders', id] as const,
  },
  goodsReceipts: {
    all: ['goods-receipts'] as const,
    list: (params?: Record<string, string>) => ['goods-receipts', 'list', params] as const,
    detail: (id: string) => ['goods-receipts', id] as const,
  },

  // Alerts
  alerts: {
    all: ['alerts'] as const,
    list: (params?: Record<string, string>) => ['alerts', 'list', params] as const,
  },

  // Reports
  kpis: (storeId: string, dateFrom?: string, dateTo?: string) =>
    ['reports', 'kpis', storeId, dateFrom, dateTo] as const,
  salesReport: (
    storeId: string,
    dateFrom?: string,
    dateTo?: string,
    groupBy?: string,
    customer?: string,
    cashier?: string,
    product?: string,
  ) =>
    ['reports', 'sales', storeId, dateFrom, dateTo, groupBy, customer, cashier, product] as const,
  stockTrend: (storeId: string, dateFrom?: string, dateTo?: string) =>
    ['reports', 'stock-trend', storeId, dateFrom, dateTo] as const,
  dailyStatistics: (storeId: string, dateFrom?: string, dateTo?: string) =>
    ['reports', 'daily-statistics', storeId, dateFrom, dateTo] as const,

  // Analytics (Advanced / AI)
  analytics: {
    all: ['analytics'] as const,
    strategic: (params: unknown) => ['analytics', 'strategic', params] as const,
    abc: (params: unknown) => ['analytics', 'abc', params] as const,
    reorder: (params: unknown) => ['analytics', 'reorder', params] as const,
    credit: (params: unknown) => ['analytics', 'credit', params] as const,
    forecast: (params: unknown) => ['analytics', 'forecast', params] as const,
    forecastSummary: (params: unknown) => ['analytics', 'forecast-summary', params] as const,
    fraud: (params: unknown) => ['analytics', 'fraud', params] as const,
    margin: (params: unknown) => ['analytics', 'margin-movers', params] as const,
    orientation: (params: unknown) => ['analytics', 'orientation', params] as const,
    customerScore: (customerId: string, params: unknown) => ['analytics', 'customers', customerId, 'score', params] as const,
    customerCreditRisk: (params: unknown) => ['analytics', 'customers', 'credit-risk', params] as const,
    customerCreditRiskForCustomer: (customerId: string, params: unknown) =>
      ['analytics', 'customers', customerId, 'credit-risk', params] as const,
    customerRecommendations: (customerId: string, params: unknown) =>
      ['analytics', 'customers', customerId, 'recommendations', params] as const,
    customerNextOrder: (customerId: string, params: unknown) =>
      ['analytics', 'customers', customerId, 'next-order', params] as const,
    customerChurnRisk: (params: unknown) => ['analytics', 'customers', 'churn-risk', params] as const,
    customerTopMonthly: (params: unknown) => ['analytics', 'customers', 'top', params] as const,
    customerDormant: (params: unknown) => ['analytics', 'customers', 'dormant', params] as const,
    customerInsights: (params: unknown) => ['analytics', 'customers', 'insights', params] as const,
  },
  // HRM
  hrm: {
    departments: {
      all: ['hrm', 'departments'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'departments', 'list', params] as const,
      detail: (id: string) => ['hrm', 'departments', id] as const,
    },
    positions: {
      all: ['hrm', 'positions'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'positions', 'list', params] as const,
      detail: (id: string) => ['hrm', 'positions', id] as const,
    },
    employees: {
      all: ['hrm', 'employees'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'employees', 'list', params] as const,
      detail: (id: string) => ['hrm', 'employees', id] as const,
    },
    contracts: {
      all: ['hrm', 'contracts'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'contracts', 'list', params] as const,
      detail: (id: string) => ['hrm', 'contracts', id] as const,
    },
    attendancePolicies: {
      all: ['hrm', 'attendance-policies'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'attendance-policies', 'list', params] as const,
    },
    attendances: {
      all: ['hrm', 'attendances'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'attendances', 'list', params] as const,
    },
    leaveTypes: {
      all: ['hrm', 'leave-types'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'leave-types', 'list', params] as const,
    },
    leaveBalances: {
      all: ['hrm', 'leave-balances'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'leave-balances', 'list', params] as const,
    },
    leaveRequests: {
      all: ['hrm', 'leave-requests'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'leave-requests', 'list', params] as const,
      detail: (id: string) => ['hrm', 'leave-requests', id] as const,
    },
    payrollPeriods: {
      all: ['hrm', 'payroll-periods'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'payroll-periods', 'list', params] as const,
      detail: (id: string) => ['hrm', 'payroll-periods', id] as const,
    },
    payslips: {
      all: ['hrm', 'payslips'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'payslips', 'list', params] as const,
      detail: (id: string) => ['hrm', 'payslips', id] as const,
    },
    salaryComponents: {
      all: ['hrm', 'salary-components'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'salary-components', 'list', params] as const,
    },
    evaluationTemplates: {
      all: ['hrm', 'evaluation-templates'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'evaluation-templates', 'list', params] as const,
      detail: (id: string) => ['hrm', 'evaluation-templates', id] as const,
    },
    performanceReviews: {
      all: ['hrm', 'performance-reviews'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'performance-reviews', 'list', params] as const,
      detail: (id: string) => ['hrm', 'performance-reviews', id] as const,
    },
    disciplinaryActions: {
      all: ['hrm', 'disciplinary-actions'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'disciplinary-actions', 'list', params] as const,
      detail: (id: string) => ['hrm', 'disciplinary-actions', id] as const,
    },
    documents: {
      all: ['hrm', 'documents'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'documents', 'list', params] as const,
    },
    holidays: {
      all: ['hrm', 'holidays'] as const,
      list: (params?: Record<string, string>) => ['hrm', 'holidays', 'list', params] as const,
    },
  },
} as const;
