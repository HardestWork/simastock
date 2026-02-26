"""Main API URL router for /api/v1/."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from api.v1 import views as v1_views
from api.v1 import analytics_views as analytics_api_views
from api.v1 import commercial_views as commercial_api_views
from api.v1 import expense_views as expense_api_views
from objectives import objective_views as objective_api_views
from cashier import cashier_analytics_views as cashier_analytics_views
from stock import stock_analytics_views as stock_analytics_views
from api.v1 import dg_views as dg_views
from api.auth_views import (
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    LogoutAPIView,
    CSRFTokenAPIView,
    PasswordResetRequestAPIView,
    PasswordResetConfirmAPIView,
)

router = DefaultRouter()
router.register(r'enterprises', v1_views.EnterpriseViewSet)
router.register(r'enterprise-subscriptions', v1_views.EnterpriseSubscriptionViewSet)
router.register(r'billing-modules', v1_views.BillingModuleViewSet, basename='billing-module')
router.register(r'billing-plans', v1_views.BillingPlanViewSet, basename='billing-plan')
router.register(r'enterprise-plan-assignments', v1_views.EnterprisePlanAssignmentViewSet, basename='enterprise-plan-assignment')
router.register(r'store-module-entitlements', v1_views.StoreModuleEntitlementViewSet, basename='store-module-entitlement')
router.register(r'stores', v1_views.StoreViewSet)
router.register(r'roles', v1_views.CustomRoleViewSet)
router.register(r'users', v1_views.UserViewSet)
router.register(r'categories', v1_views.CategoryViewSet)
router.register(r'brands', v1_views.BrandViewSet)
router.register(r'products', v1_views.ProductViewSet)
router.register(r'stock', v1_views.ProductStockViewSet)
router.register(r'stock-movements', v1_views.InventoryMovementViewSet)
router.register(r'stock-transfers', v1_views.StockTransferViewSet)
router.register(r'stock-counts', v1_views.StockCountViewSet)
router.register(r'customers', v1_views.CustomerViewSet)
router.register(r'sales', v1_views.SaleViewSet)
router.register(r'quotes', v1_views.QuoteViewSet)
router.register(r'payments', v1_views.PaymentViewSet)
router.register(r'cash-shifts', v1_views.CashShiftViewSet)
router.register(r'credit-accounts', v1_views.CustomerAccountViewSet)
router.register(r'credit-ledger', v1_views.CreditLedgerViewSet)
router.register(r'payment-schedules', v1_views.PaymentScheduleViewSet)
router.register(r'suppliers', v1_views.SupplierViewSet)
router.register(r'purchase-orders', v1_views.PurchaseOrderViewSet)
router.register(r'goods-receipts', v1_views.GoodsReceiptViewSet)
router.register(r'alerts', v1_views.AlertViewSet)
router.register(r'refunds', v1_views.RefundViewSet)
router.register(r'audit-logs', v1_views.AuditLogViewSet)
router.register(r'store-users', v1_views.StoreUserViewSet, basename='store-user')
router.register(r'expense-categories', expense_api_views.ExpenseCategoryViewSet, basename='expense-category')
router.register(r'wallets', expense_api_views.WalletViewSet, basename='wallet')
router.register(r'expenses', expense_api_views.ExpenseViewSet, basename='expense')
router.register(r'expense-budgets', expense_api_views.BudgetViewSet, basename='expense-budget')
router.register(r'recurring-expenses', expense_api_views.RecurringExpenseViewSet, basename='recurring-expense')
router.register(r'objective-rules', objective_api_views.ObjectiveRuleViewSet, basename='objective-rule')
router.register(r'seller-objectives', objective_api_views.SellerObjectiveViewSet, basename='seller-objective')
router.register(r'objective-penalty-types', objective_api_views.SellerPenaltyTypeViewSet, basename='objective-penalty-type')
router.register(r'objective-penalties', objective_api_views.SellerPenaltyViewSet, basename='objective-penalty')
router.register(r'objective-sprints', objective_api_views.SprintViewSet, basename='objective-sprint')
router.register(r'commercial/regions', commercial_api_views.CommercialRegionViewSet, basename='commercial-region')
router.register(r'commercial/sectors', commercial_api_views.CommercialSectorViewSet, basename='commercial-sector')
router.register(r'commercial/tags', commercial_api_views.CommercialTagViewSet, basename='commercial-tag')
router.register(r'commercial/lead-sources', commercial_api_views.CommercialLeadSourceViewSet, basename='commercial-lead-source')
router.register(r'commercial/prospects', commercial_api_views.CommercialProspectViewSet, basename='commercial-prospect')
router.register(r'commercial/opportunities', commercial_api_views.CommercialOpportunityViewSet, basename='commercial-opportunity')
router.register(r'commercial/activities', commercial_api_views.CommercialActivityViewSet, basename='commercial-activity')
router.register(r'commercial/tasks', commercial_api_views.CommercialFollowUpTaskViewSet, basename='commercial-task')
router.register(r'commercial/objectives', commercial_api_views.CommercialObjectiveMonthlyViewSet, basename='commercial-objective')
router.register(r'commercial/incentive-policies', commercial_api_views.CommercialIncentivePolicyViewSet, basename='commercial-incentive-policy')
router.register(r'commercial/incentive-runs', commercial_api_views.CommercialIncentiveRunViewSet, basename='commercial-incentive-run')
router.register(r'commercial/exports', commercial_api_views.CommercialExportsViewSet, basename='commercial-exports')


app_name = 'api'
urlpatterns = [
    path('', include(router.urls)),

    # Auth endpoints
    path('auth/csrf/', CSRFTokenAPIView.as_view(), name='auth-csrf'),
    path('auth/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutAPIView.as_view(), name='auth-logout'),
    path('auth/me/', v1_views.MeView.as_view(), name='auth-me'),
    path('auth/module-matrix/', v1_views.ModuleMatrixView.as_view(), name='auth-module-matrix'),
    path('auth/password/change/', v1_views.ChangePasswordView.as_view(), name='auth-password-change'),
    path('auth/password/reset/', PasswordResetRequestAPIView.as_view(), name='auth-password-reset'),
    path('auth/password/reset/confirm/', PasswordResetConfirmAPIView.as_view(), name='auth-password-reset-confirm'),

    # Reports
    path('reports/kpis/', v1_views.KPIView.as_view(), name='kpis'),
    path('reports/sales/', v1_views.SalesReportAPIView.as_view(), name='sales-report'),
    path('reports/stock-trend/', v1_views.StockValueTrendView.as_view(), name='stock-value-trend'),
    path('reports/daily-statistics/', v1_views.DailyStatisticsAPIView.as_view(), name='daily-statistics'),

    # Analytics
    path('analytics/strategic-kpis/', analytics_api_views.StrategicKPIAPIView.as_view(), name='analytics-strategic-kpis'),
    path('analytics/abc/', analytics_api_views.ABCAnalysisAPIView.as_view(), name='analytics-abc'),
    path('analytics/reorder/', analytics_api_views.ReorderRecommendationAPIView.as_view(), name='analytics-reorder'),
    path('analytics/credit-scores/', analytics_api_views.CreditScoreAPIView.as_view(), name='analytics-credit-scores'),
    path('analytics/forecast/', analytics_api_views.SalesForecastAPIView.as_view(), name='analytics-forecast'),
    path('analytics/fraud-events/', analytics_api_views.FraudEventsAPIView.as_view(), name='analytics-fraud-events'),
    path('analytics/forecast-summary/', analytics_api_views.ForecastSummaryView.as_view(), name='analytics-forecast-summary'),
    path('analytics/margin-movers/', analytics_api_views.MarginMoversAPIView.as_view(), name='analytics-margin-movers'),
    path('analytics/orientation/', analytics_api_views.OrientationAdviceAPIView.as_view(), name='analytics-orientation'),
    path('analytics/customers/insights/', analytics_api_views.CustomerInsightsAPIView.as_view(), name='analytics-customers-insights'),
    path('analytics/customers/top/', analytics_api_views.CustomerTopClientsAPIView.as_view(), name='analytics-customers-top'),
    path('analytics/customers/dormant/', analytics_api_views.CustomerDormantAPIView.as_view(), name='analytics-customers-dormant'),
    path('analytics/customers/credit-risk/', analytics_api_views.CustomerCreditRiskAPIView.as_view(), name='analytics-customers-credit-risk'),
    path('analytics/customers/churn-risk/', analytics_api_views.CustomerChurnRiskAPIView.as_view(), name='analytics-customers-churn-risk'),
    path('analytics/customers/<uuid:customer_id>/score/', analytics_api_views.CustomerScoreAPIView.as_view(), name='analytics-customers-score'),
    path('analytics/customers/<uuid:customer_id>/recommendations/', analytics_api_views.CustomerRecommendationsAPIView.as_view(), name='analytics-customers-recommendations'),
    path('analytics/customers/<uuid:customer_id>/next-order/', analytics_api_views.CustomerNextOrderAPIView.as_view(), name='analytics-customers-next-order'),
    path('analytics/admin/customer-rules/', analytics_api_views.CustomerAnalyticsRulesAPIView.as_view(), name='analytics-customer-rules'),

    # Expenses analytics
    path('expenses/dashboard/', expense_api_views.ExpenseDashboardAPIView.as_view(), name='expenses-dashboard'),

    # Objectives
    path('objectives/seller/dashboard/', objective_api_views.SellerDashboardView.as_view(), name='objective-seller-dashboard'),
    path('objectives/seller/history/', objective_api_views.SellerHistoryView.as_view(), name='objective-seller-history'),
    path('objectives/seller/badges/', objective_api_views.MyBadgesView.as_view(), name='objective-my-badges'),
    path('objectives/leaderboard/', objective_api_views.LeaderboardView.as_view(), name='objective-leaderboard'),
    path('objectives/leaderboard/settings/', objective_api_views.LeaderboardSettingsView.as_view(), name='objective-leaderboard-settings'),
    path('objectives/admin/stats/', objective_api_views.SellerStatsAdminView.as_view(), name='objective-admin-stats'),
    path('objectives/recompute/', objective_api_views.RecomputeView.as_view(), name='objective-recompute'),
    path('objectives/seller/ranking/', objective_api_views.SellerMultiPeriodRankingView.as_view(), name='objective-seller-ranking'),
    path('objectives/seller/credit-quality/', objective_api_views.SellerCreditQualityView.as_view(), name='objective-seller-credit-quality'),
    path('objectives/seller/product-mix/', objective_api_views.SellerProductMixView.as_view(), name='objective-seller-product-mix'),
    path('objectives/seller/coaching/', objective_api_views.SellerCoachingView.as_view(), name='objective-seller-coaching'),

    # Cashier analytics
    path('cashier-analytics/dashboard/', cashier_analytics_views.CashierAnalyticsDashboardView.as_view(), name='cashier-analytics-dashboard'),
    path('cashier-analytics/team/', cashier_analytics_views.CashierAnalyticsTeamView.as_view(), name='cashier-analytics-team'),

    # Stock analytics
    path('stock-analytics/dashboard/', stock_analytics_views.StockAnalyticsDashboardView.as_view(), name='stock-analytics-dashboard'),
    path('stock-analytics/alerts/', stock_analytics_views.StockAnalyticsAlertsView.as_view(), name='stock-analytics-alerts'),

    # DG Dashboard
    path('dg/dashboard/', dg_views.DGDashboardView.as_view(), name='dg-dashboard'),
]
