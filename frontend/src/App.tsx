/** Main application â€” React Router + TanStack Query providers. */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/lib/toast';
import ProtectedRoute from '@/auth/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import ThemeProvider from '@/components/shared/ThemeProvider';

// Eager-loaded pages (critical path)
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';

// Retry wrapper for lazy imports: on stale-chunk failure, bust the cache
// with a query-string and retry once before giving up.
function lazyRetry<T extends { default: React.ComponentType<unknown> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Loading CSS chunk')
      ) {
        // Force a full reload so the browser fetches the new index.html.
        window.location.reload();
        // Return a never-resolving promise to avoid a flash of error UI.
        return new Promise<T>(() => {});
      }
      throw err;
    }),
  );
}

// Lazy-loaded feature pages
const ForgotPasswordPage = lazyRetry(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazyRetry(() => import('@/features/auth/ResetPasswordPage'));
const SaleListPage = lazyRetry(() => import('@/features/pos/SaleListPage'));
const PosPage = lazyRetry(() => import('@/features/pos/PosPage'));
const CashierDashboard = lazyRetry(() => import('@/features/cashier/CashierDashboard'));
const ProcessPaymentPage = lazyRetry(() => import('@/features/cashier/ProcessPaymentPage'));
const ProductListPage = lazyRetry(() => import('@/features/catalog/ProductListPage'));
const StockLevelsPage = lazyRetry(() => import('@/features/stock/StockLevelsPage'));
const MovementListPage = lazyRetry(() => import('@/features/stock/MovementListPage'));
const MovementDocumentPage = lazyRetry(() => import('@/features/stock/MovementDocumentPage'));
const StockEntryPage = lazyRetry(() => import('@/features/stock/StockEntryPage'));
const StockAdjustPage = lazyRetry(() => import('@/features/stock/StockAdjustPage'));
const TransferListPage = lazyRetry(() => import('@/features/stock/TransferListPage'));
const TransferCreatePage = lazyRetry(() => import('@/features/stock/TransferCreatePage'));
const TransferDetailPage = lazyRetry(() => import('@/features/stock/TransferDetailPage'));
const CountListPage = lazyRetry(() => import('@/features/stock/CountListPage'));
const CountCreatePage = lazyRetry(() => import('@/features/stock/CountCreatePage'));
const CountDetailPage = lazyRetry(() => import('@/features/stock/CountDetailPage'));
const ProductFormPage = lazyRetry(() => import('@/features/catalog/ProductFormPage'));
const ProductDetailPage = lazyRetry(() => import('@/features/catalog/ProductDetailPage'));
const CategoryListPage = lazyRetry(() => import('@/features/catalog/CategoryListPage'));
const BrandListPage = lazyRetry(() => import('@/features/catalog/BrandListPage'));
const CustomerListPage = lazyRetry(() => import('@/features/customers/CustomerListPage'));
const CustomerFormPage = lazyRetry(() => import('@/features/customers/CustomerFormPage'));
const CustomerDetailPage = lazyRetry(() => import('@/features/customers/CustomerDetailPage'));
const CreditListPage = lazyRetry(() => import('@/features/credits/CreditListPage'));
const CreditDetailPage = lazyRetry(() => import('@/features/credits/CreditDetailPage'));
const PaymentReceiptPage = lazyRetry(() => import('@/features/cashier/PaymentReceiptPage'));
const SupplierListPage = lazyRetry(() => import('@/features/purchases/SupplierListPage'));
const PurchaseListPage = lazyRetry(() => import('@/features/purchases/PurchaseListPage'));
const PurchaseFormPage = lazyRetry(() => import('@/features/purchases/PurchaseFormPage'));
const PurchaseDetailPage = lazyRetry(() => import('@/features/purchases/PurchaseDetailPage'));
const GoodsReceiptCreatePage = lazyRetry(() => import('@/features/purchases/GoodsReceiptCreatePage'));
const ReportsPage = lazyRetry(() => import('@/features/reports/ReportsPage'));
const AlertListPage = lazyRetry(() => import('@/features/alerts/AlertListPage'));
const SettingsPage = lazyRetry(() => import('@/features/settings/SettingsPage'));
const ProfilePage = lazyRetry(() => import('@/features/settings/ProfilePage'));
const UserListPage = lazyRetry(() => import('@/features/settings/UserListPage'));
const UserFormPage = lazyRetry(() => import('@/features/settings/UserFormPage'));
const RoleListPage = lazyRetry(() => import('@/features/settings/RoleListPage'));
const QuoteListPage = lazyRetry(() => import('@/features/quotes/QuoteListPage'));
const QuoteFormPage = lazyRetry(() => import('@/features/quotes/QuoteFormPage'));
const QuoteDetailPage = lazyRetry(() => import('@/features/quotes/QuoteDetailPage'));
const AnalyticsPage = lazyRetry(() => import('@/features/analytics/AnalyticsPage'));
const StatisticsPage = lazyRetry(() => import('@/features/statistics/StatisticsPage'));
const EnterpriseSetupPage = lazyRetry(() => import('@/features/settings/EnterpriseSetupPage'));
const EnterpriseListPage = lazyRetry(() => import('@/features/settings/EnterpriseListPage'));
const EnterpriseSubscriptionPage = lazyRetry(() => import('@/features/settings/EnterpriseSubscriptionPage'));
const StoreUserCapabilitiesPage = lazyRetry(() => import('@/features/settings/StoreUserCapabilitiesPage'));
const ModuleEntitlementsPage = lazyRetry(() => import('@/features/settings/ModuleEntitlementsPage'));
const ExpenseListPage = lazyRetry(() => import('@/features/expenses/ExpenseListPage'));
const ExpenseDashboardPage = lazyRetry(() => import('@/features/expenses/ExpenseDashboardPage'));
const ExpenseSettingsPage = lazyRetry(() => import('@/features/expenses/ExpenseSettingsPage'));
const SellerObjectivePage = lazyRetry(() => import('@/features/objectives/SellerObjectivePage'));
const ObjectiveAdminPage = lazyRetry(() => import('@/features/objectives/ObjectiveAdminPage'));
const CashierAnalyticsPage = lazyRetry(() => import('@/features/cashier/CashierAnalyticsPage'));
const CashierTeamAnalyticsPage = lazyRetry(() => import('@/features/cashier/CashierTeamAnalyticsPage'));
const StockAnalyticsPage = lazyRetry(() => import('@/features/stock/StockAnalyticsPage'));
const DGDashboardPage = lazyRetry(() => import('@/features/dg/DGDashboardPage'));
const CustomerIntelligencePage = lazyRetry(() => import('@/features/customers/CustomerIntelligencePage'));
const CommercialPage = lazyRetry(() => import('@/features/commercial/CommercialPage'));
const HrmEmployeeListPage = lazyRetry(() => import('@/features/hrm/EmployeeListPage'));
const HrmEmployeeDetailPage = lazyRetry(() => import('@/features/hrm/EmployeeDetailPage'));
const HrmEmployeeFormPage = lazyRetry(() => import('@/features/hrm/EmployeeFormPage'));
const HrmLeaveRequestListPage = lazyRetry(() => import('@/features/hrm/LeaveRequestListPage'));
const HrmAttendanceListPage = lazyRetry(() => import('@/features/hrm/AttendanceListPage'));
const HrmPayrollPage = lazyRetry(() => import('@/features/hrm/PayrollPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="top-right" toastOptions={{ duration: 3000 }} />
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* POS */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['SALES', 'MANAGER', 'ADMIN']}
                      allowedCapabilities={['CAN_SELL']}
                      requiredModules={['SELL']}
                    />
                  }
                >
                  <Route path="/pos" element={<Suspense fallback={<PageLoader />}><SaleListPage /></Suspense>} />
                  <Route path="/pos/new" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
                </Route>

                {/* Quotes (Devis) */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['SALES', 'MANAGER', 'ADMIN']}
                      allowedCapabilities={['CAN_SELL']}
                      requiredModules={['SELL']}
                    />
                  }
                >
                  <Route path="/quotes" element={<Suspense fallback={<PageLoader />}><QuoteListPage /></Suspense>} />
                  <Route path="/quotes/new" element={<Suspense fallback={<PageLoader />}><QuoteFormPage /></Suspense>} />
                  <Route path="/quotes/:id" element={<Suspense fallback={<PageLoader />}><QuoteDetailPage /></Suspense>} />
                  <Route path="/quotes/:id/edit" element={<Suspense fallback={<PageLoader />}><QuoteFormPage /></Suspense>} />
                </Route>

                {/* Commercial CRM */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['COMMERCIAL', 'SALES', 'MANAGER', 'ADMIN']}
                      requiredModules={['COMMERCIAL']}
                      allowedCapabilities={['CAN_MANAGE_LEADS', 'CAN_MANAGE_OPPORTUNITIES', 'CAN_LOG_ACTIVITY', 'CAN_APPROVE_COMMERCIAL_BONUS']}
                    />
                  }
                >
                  <Route path="/commercial" element={<Suspense fallback={<PageLoader />}><CommercialPage /></Suspense>} />
                  <Route path="/commercial/prospects" element={<Suspense fallback={<PageLoader />}><CommercialPage /></Suspense>} />
                  <Route path="/commercial/tasks" element={<Suspense fallback={<PageLoader />}><CommercialPage /></Suspense>} />
                  <Route path="/commercial/incentives" element={<Suspense fallback={<PageLoader />}><CommercialPage /></Suspense>} />
                </Route>

                {/* Cashier */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}
                      allowedCapabilities={['CAN_CASH']}
                      requiredModules={['CASH']}
                    />
                  }
                >
                  <Route path="/cashier" element={<Suspense fallback={<PageLoader />}><CashierDashboard /></Suspense>} />
                  <Route path="/cashier/payment/:saleId" element={<Suspense fallback={<PageLoader />}><ProcessPaymentPage /></Suspense>} />
                  <Route path="/cashier/receipt/:saleId" element={<Suspense fallback={<PageLoader />}><PaymentReceiptPage /></Suspense>} />
                </Route>
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}
                      allowedCapabilities={['CAN_CASH']}
                      requiredModules={['ANALYTICS_CASHIER']}
                    />
                  }
                >
                  <Route path="/cashier/analytics" element={<Suspense fallback={<PageLoader />}><CashierAnalyticsPage /></Suspense>} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_CASHIER']} />}>
                  <Route path="/cashier/team-analytics" element={<Suspense fallback={<PageLoader />}><CashierTeamAnalyticsPage /></Suspense>} />
                </Route>

                {/* Catalog (read) */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN', 'STOCKER']} requiredModules={['SELL']} />}>
                  <Route path="/catalog" element={<Suspense fallback={<PageLoader />}><ProductListPage /></Suspense>} />
                  <Route path="/catalog/:id" element={<Suspense fallback={<PageLoader />}><ProductDetailPage /></Suspense>} />
                </Route>

                {/* Catalog (manage) */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['STOCK']} />}>
                  <Route path="/catalog/new" element={<Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>} />
                  <Route path="/catalog/categories" element={<Suspense fallback={<PageLoader />}><CategoryListPage /></Suspense>} />
                  <Route path="/catalog/brands" element={<Suspense fallback={<PageLoader />}><BrandListPage /></Suspense>} />
                  <Route path="/catalog/:id/edit" element={<Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>} />
                </Route>

                {/* Stock */}
                <Route element={<ProtectedRoute allowedRoles={['STOCKER', 'MANAGER', 'ADMIN']} requiredModules={['STOCK']} />}>
                  <Route path="/stock" element={<Suspense fallback={<PageLoader />}><StockLevelsPage /></Suspense>} />
                  <Route path="/stock/movements" element={<Suspense fallback={<PageLoader />}><MovementListPage /></Suspense>} />
                  <Route path="/stock/movements/:batchId" element={<Suspense fallback={<PageLoader />}><MovementDocumentPage /></Suspense>} />
                  <Route path="/stock/entry" element={<Suspense fallback={<PageLoader />}><StockEntryPage /></Suspense>} />
                  <Route path="/stock/adjust" element={<Suspense fallback={<PageLoader />}><StockAdjustPage /></Suspense>} />
                  <Route path="/stock/transfers" element={<Suspense fallback={<PageLoader />}><TransferListPage /></Suspense>} />
                  <Route path="/stock/transfers/new" element={<Suspense fallback={<PageLoader />}><TransferCreatePage /></Suspense>} />
                  <Route path="/stock/transfers/:id" element={<Suspense fallback={<PageLoader />}><TransferDetailPage /></Suspense>} />
                  <Route path="/stock/counts" element={<Suspense fallback={<PageLoader />}><CountListPage /></Suspense>} />
                  <Route path="/stock/counts/new" element={<Suspense fallback={<PageLoader />}><CountCreatePage /></Suspense>} />
                  <Route path="/stock/counts/:id" element={<Suspense fallback={<PageLoader />}><CountDetailPage /></Suspense>} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['STOCKER', 'MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_STOCK']} />}>
                  <Route path="/stock/analytics" element={<Suspense fallback={<PageLoader />}><StockAnalyticsPage /></Suspense>} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_DG']} />}>
                  <Route path="/dg/dashboard" element={<Suspense fallback={<PageLoader />}><DGDashboardPage /></Suspense>} />
                </Route>

                {/* Customers */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN', 'CASHIER']} requiredModules={['CUSTOMER']} />}>
                  <Route path="/customers" element={<Suspense fallback={<PageLoader />}><CustomerListPage /></Suspense>} />
                  <Route path="/customers/new" element={<Suspense fallback={<PageLoader />}><CustomerFormPage /></Suspense>} />
                  <Route path="/customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetailPage /></Suspense>} />
                  <Route path="/customers/:id/edit" element={<Suspense fallback={<PageLoader />}><CustomerFormPage /></Suspense>} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['CLIENT_INTEL']} />}>
                  <Route path="/customers/intelligence" element={<Suspense fallback={<PageLoader />}><CustomerIntelligencePage /></Suspense>} />
                </Route>

                {/* Credits */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN', 'CASHIER']} requiredModules={['CUSTOMER']} />}>
                  <Route path="/credits" element={<Suspense fallback={<PageLoader />}><CreditListPage /></Suspense>} />
                  <Route path="/credits/:id" element={<Suspense fallback={<PageLoader />}><CreditDetailPage /></Suspense>} />
                </Route>

                {/* Expenses */}
                <Route element={<ProtectedRoute allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']} requiredModules={['EXPENSE']} />}>
                  <Route path="/expenses" element={<Suspense fallback={<PageLoader />}><ExpenseListPage /></Suspense>} />
                  <Route path="/expenses/dashboard" element={<Suspense fallback={<PageLoader />}><ExpenseDashboardPage /></Suspense>} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['EXPENSE']} />}>
                  <Route path="/expenses/settings" element={<Suspense fallback={<PageLoader />}><ExpenseSettingsPage /></Suspense>} />
                </Route>

                {/* Purchases */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['PURCHASE']} />}>
                  <Route path="/purchases" element={<Navigate to="/purchases/orders" replace />} />
                  <Route path="/purchases/suppliers" element={<Suspense fallback={<PageLoader />}><SupplierListPage /></Suspense>} />
                  <Route path="/purchases/orders" element={<Suspense fallback={<PageLoader />}><PurchaseListPage /></Suspense>} />
                  <Route path="/purchases/orders/new" element={<Suspense fallback={<PageLoader />}><PurchaseFormPage /></Suspense>} />
                  <Route path="/purchases/orders/:id" element={<Suspense fallback={<PageLoader />}><PurchaseDetailPage /></Suspense>} />
                  <Route path="/purchases/orders/:id/edit" element={<Suspense fallback={<PageLoader />}><PurchaseFormPage /></Suspense>} />
                  <Route path="/purchases/orders/:id/receive" element={<Suspense fallback={<PageLoader />}><GoodsReceiptCreatePage /></Suspense>} />
                </Route>

                {/* Objectives — seller view */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN']} requiredModules={['SELLER_PERF']} />}>
                  <Route path="/objectives/my-goal" element={<Suspense fallback={<PageLoader />}><SellerObjectivePage /></Suspense>} />
                </Route>

                {/* Objectives — admin */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['SELLER_PERF']} />}>
                  <Route path="/objectives/admin" element={<Suspense fallback={<PageLoader />}><ObjectiveAdminPage /></Suspense>} />
                </Route>

                {/* Reports */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_MANAGER']} />}>
                  <Route path="/reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
                </Route>

                {/* Statistics */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_MANAGER']} />}>
                  <Route path="/statistics" element={<Suspense fallback={<PageLoader />}><StatisticsPage /></Suspense>} />
                </Route>

                {/* Analytics / AI */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} requiredModules={['ANALYTICS_MANAGER']} />}>
                  <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense>} />
                </Route>

                {/* HRM */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['HR', 'MANAGER', 'ADMIN']}
                      requiredModules={['HRM']}
                      allowedCapabilities={['CAN_VIEW_HRM', 'CAN_MANAGE_HRM']}
                    />
                  }
                >
                  <Route path="/hrm" element={<Navigate to="/hrm/employees" replace />} />
                  <Route path="/hrm/employees" element={<Suspense fallback={<PageLoader />}><HrmEmployeeListPage /></Suspense>} />
                  <Route path="/hrm/employees/new" element={<Suspense fallback={<PageLoader />}><HrmEmployeeFormPage /></Suspense>} />
                  <Route path="/hrm/employees/:id" element={<Suspense fallback={<PageLoader />}><HrmEmployeeDetailPage /></Suspense>} />
                  <Route path="/hrm/employees/:id/edit" element={<Suspense fallback={<PageLoader />}><HrmEmployeeFormPage /></Suspense>} />
                  <Route path="/hrm/leaves" element={<Suspense fallback={<PageLoader />}><HrmLeaveRequestListPage /></Suspense>} />
                  <Route path="/hrm/attendance" element={<Suspense fallback={<PageLoader />}><HrmAttendanceListPage /></Suspense>} />
                  <Route path="/hrm/payroll" element={<Suspense fallback={<PageLoader />}><HrmPayrollPage /></Suspense>} />
                </Route>

                {/* Profile (all authenticated users) */}
                <Route path="/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />

                {/* Alerts */}
                <Route element={<ProtectedRoute requiredModules={['ALERTS']} />}>
                  <Route path="/alerts" element={<Suspense fallback={<PageLoader />}><AlertListPage /></Suspense>} />
                </Route>

                {/* Settings */}
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['MANAGER', 'ADMIN']}
                      requiredModules={['CORE']}
                      allowedCapabilities={['CAN_MANAGE_USERS', 'CAN_MANAGE_STORES', 'CAN_MANAGE_SUBSCRIPTIONS', 'CAN_MANAGE_MODULES']}
                    />
                  }
                >
                  <Route path="/settings" element={<Navigate to="/settings/stores" replace />} />
                  <Route path="/settings/stores" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/invoice" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/structure" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/users" element={<Suspense fallback={<PageLoader />}><UserListPage /></Suspense>} />
                  <Route path="/settings/users/new" element={<Suspense fallback={<PageLoader />}><UserFormPage /></Suspense>} />
                  <Route path="/settings/users/:id/edit" element={<Suspense fallback={<PageLoader />}><UserFormPage /></Suspense>} />
                  <Route path="/settings/roles" element={<Suspense fallback={<PageLoader />}><RoleListPage /></Suspense>} />
                  <Route path="/settings/permissions" element={<Suspense fallback={<PageLoader />}><StoreUserCapabilitiesPage /></Suspense>} />
                  <Route element={<ProtectedRoute superuserOnly />}>
                    <Route path="/settings/modules" element={<Suspense fallback={<PageLoader />}><ModuleEntitlementsPage /></Suspense>} />
                    <Route path="/settings/subscriptions" element={<Suspense fallback={<PageLoader />}><EnterpriseSubscriptionPage /></Suspense>} />
                    <Route path="/settings/enterprises" element={<Suspense fallback={<PageLoader />}><EnterpriseListPage /></Suspense>} />
                    <Route path="/settings/enterprise-setup" element={<Suspense fallback={<PageLoader />}><EnterpriseSetupPage /></Suspense>} />
                  </Route>
                </Route>
              </Route>
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
