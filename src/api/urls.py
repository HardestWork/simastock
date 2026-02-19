"""Main API URL router for /api/v1/."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from api.v1 import views as v1_views
from api.v1 import analytics_views as analytics_api_views
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


app_name = 'api'
urlpatterns = [
    path('', include(router.urls)),

    # Auth endpoints
    path('auth/csrf/', CSRFTokenAPIView.as_view(), name='auth-csrf'),
    path('auth/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutAPIView.as_view(), name='auth-logout'),
    path('auth/me/', v1_views.MeView.as_view(), name='auth-me'),
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
]
