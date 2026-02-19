/** Main application — React Router + TanStack Query providers. */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from '@/auth/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

// Eager-loaded pages (critical path)
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';

// Lazy-loaded feature pages
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const SaleListPage = lazy(() => import('@/features/pos/SaleListPage'));
const PosPage = lazy(() => import('@/features/pos/PosPage'));
const CashierDashboard = lazy(() => import('@/features/cashier/CashierDashboard'));
const ProcessPaymentPage = lazy(() => import('@/features/cashier/ProcessPaymentPage'));
const ProductListPage = lazy(() => import('@/features/catalog/ProductListPage'));
const StockLevelsPage = lazy(() => import('@/features/stock/StockLevelsPage'));
const MovementListPage = lazy(() => import('@/features/stock/MovementListPage'));
const MovementDocumentPage = lazy(() => import('@/features/stock/MovementDocumentPage'));
const StockEntryPage = lazy(() => import('@/features/stock/StockEntryPage'));
const StockAdjustPage = lazy(() => import('@/features/stock/StockAdjustPage'));
const TransferListPage = lazy(() => import('@/features/stock/TransferListPage'));
const TransferCreatePage = lazy(() => import('@/features/stock/TransferCreatePage'));
const TransferDetailPage = lazy(() => import('@/features/stock/TransferDetailPage'));
const CountListPage = lazy(() => import('@/features/stock/CountListPage'));
const CountCreatePage = lazy(() => import('@/features/stock/CountCreatePage'));
const CountDetailPage = lazy(() => import('@/features/stock/CountDetailPage'));
const ProductFormPage = lazy(() => import('@/features/catalog/ProductFormPage'));
const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage'));
const CategoryListPage = lazy(() => import('@/features/catalog/CategoryListPage'));
const BrandListPage = lazy(() => import('@/features/catalog/BrandListPage'));
const CustomerListPage = lazy(() => import('@/features/customers/CustomerListPage'));
const CustomerFormPage = lazy(() => import('@/features/customers/CustomerFormPage'));
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage'));
const CreditListPage = lazy(() => import('@/features/credits/CreditListPage'));
const CreditDetailPage = lazy(() => import('@/features/credits/CreditDetailPage'));
const PaymentReceiptPage = lazy(() => import('@/features/cashier/PaymentReceiptPage'));
const PurchaseListPage = lazy(() => import('@/features/purchases/PurchaseListPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const AlertListPage = lazy(() => import('@/features/alerts/AlertListPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage'));
const UserListPage = lazy(() => import('@/features/settings/UserListPage'));
const UserFormPage = lazy(() => import('@/features/settings/UserFormPage'));
const RoleListPage = lazy(() => import('@/features/settings/RoleListPage'));
const QuoteListPage = lazy(() => import('@/features/quotes/QuoteListPage'));
const QuoteFormPage = lazy(() => import('@/features/quotes/QuoteFormPage'));
const QuoteDetailPage = lazy(() => import('@/features/quotes/QuoteDetailPage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));
const StatisticsPage = lazy(() => import('@/features/statistics/StatisticsPage'));
const EnterpriseSetupPage = lazy(() => import('@/features/settings/EnterpriseSetupPage'));
const EnterpriseListPage = lazy(() => import('@/features/settings/EnterpriseListPage'));
const StoreUserCapabilitiesPage = lazy(() => import('@/features/settings/StoreUserCapabilitiesPage'));

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
    <QueryClientProvider client={queryClient}>
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
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN']} />}>
                  <Route path="/pos" element={<Suspense fallback={<PageLoader />}><SaleListPage /></Suspense>} />
                  <Route path="/pos/new" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
                </Route>

                {/* Quotes (Devis) */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN']} />}>
                  <Route path="/quotes" element={<Suspense fallback={<PageLoader />}><QuoteListPage /></Suspense>} />
                  <Route path="/quotes/new" element={<Suspense fallback={<PageLoader />}><QuoteFormPage /></Suspense>} />
                  <Route path="/quotes/:id" element={<Suspense fallback={<PageLoader />}><QuoteDetailPage /></Suspense>} />
                  <Route path="/quotes/:id/edit" element={<Suspense fallback={<PageLoader />}><QuoteFormPage /></Suspense>} />
                </Route>

                {/* Cashier */}
                <Route element={<ProtectedRoute allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']} />}>
                  <Route path="/cashier" element={<Suspense fallback={<PageLoader />}><CashierDashboard /></Suspense>} />
                  <Route path="/cashier/payment/:saleId" element={<Suspense fallback={<PageLoader />}><ProcessPaymentPage /></Suspense>} />
                  <Route path="/cashier/receipt/:saleId" element={<Suspense fallback={<PageLoader />}><PaymentReceiptPage /></Suspense>} />
                </Route>

                {/* Catalog */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN', 'STOCKER']} />}>
                  <Route path="/catalog" element={<Suspense fallback={<PageLoader />}><ProductListPage /></Suspense>} />
                  <Route path="/catalog/new" element={<Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>} />
                  <Route path="/catalog/categories" element={<Suspense fallback={<PageLoader />}><CategoryListPage /></Suspense>} />
                  <Route path="/catalog/brands" element={<Suspense fallback={<PageLoader />}><BrandListPage /></Suspense>} />
                  <Route path="/catalog/:id" element={<Suspense fallback={<PageLoader />}><ProductDetailPage /></Suspense>} />
                  <Route path="/catalog/:id/edit" element={<Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>} />
                </Route>

                {/* Stock */}
                <Route element={<ProtectedRoute allowedRoles={['STOCKER', 'MANAGER', 'ADMIN']} />}>
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

                {/* Customers */}
                <Route element={<ProtectedRoute allowedRoles={['SALES', 'MANAGER', 'ADMIN', 'CASHIER']} />}>
                  <Route path="/customers" element={<Suspense fallback={<PageLoader />}><CustomerListPage /></Suspense>} />
                  <Route path="/customers/new" element={<Suspense fallback={<PageLoader />}><CustomerFormPage /></Suspense>} />
                  <Route path="/customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetailPage /></Suspense>} />
                  <Route path="/customers/:id/edit" element={<Suspense fallback={<PageLoader />}><CustomerFormPage /></Suspense>} />
                </Route>

                {/* Credits */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN', 'CASHIER']} />}>
                  <Route path="/credits" element={<Suspense fallback={<PageLoader />}><CreditListPage /></Suspense>} />
                  <Route path="/credits/:id" element={<Suspense fallback={<PageLoader />}><CreditDetailPage /></Suspense>} />
                </Route>

                {/* Purchases */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} />}>
                  <Route path="/purchases" element={<Suspense fallback={<PageLoader />}><PurchaseListPage /></Suspense>} />
                </Route>

                {/* Reports */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} />}>
                  <Route path="/reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
                </Route>

                {/* Statistics */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} />}>
                  <Route path="/statistics" element={<Suspense fallback={<PageLoader />}><StatisticsPage /></Suspense>} />
                </Route>

                {/* Analytics / AI */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']} />}>
                  <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense>} />
                </Route>

                {/* Profile (all authenticated users) */}
                <Route path="/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />

                {/* Alerts */}
                <Route path="/alerts" element={<Suspense fallback={<PageLoader />}><AlertListPage /></Suspense>} />

                {/* Settings */}
                <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                  <Route path="/settings" element={<Navigate to="/settings/stores" replace />} />
                  <Route path="/settings/stores" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/invoice" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/structure" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/users" element={<Suspense fallback={<PageLoader />}><UserListPage /></Suspense>} />
                  <Route path="/settings/users/new" element={<Suspense fallback={<PageLoader />}><UserFormPage /></Suspense>} />
                  <Route path="/settings/users/:id/edit" element={<Suspense fallback={<PageLoader />}><UserFormPage /></Suspense>} />
                  <Route path="/settings/roles" element={<Suspense fallback={<PageLoader />}><RoleListPage /></Suspense>} />
                  <Route path="/settings/permissions" element={<Suspense fallback={<PageLoader />}><StoreUserCapabilitiesPage /></Suspense>} />
                  <Route path="/settings/enterprises" element={<Suspense fallback={<PageLoader />}><EnterpriseListPage /></Suspense>} />
                  <Route path="/settings/enterprise-setup" element={<Suspense fallback={<PageLoader />}><EnterpriseSetupPage /></Suspense>} />
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
  );
}
