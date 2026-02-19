from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    # Authentication
    path("login/", views.CustomLoginView.as_view(), name="login"),
    path("signup/", views.PublicSignupView.as_view(), name="signup"),
    path("signup/pending/", views.SignupPendingView.as_view(), name="signup-pending"),
    path(
        "verify-email/resend/",
        views.ResendVerificationEmailView.as_view(),
        name="resend-verification-email",
    ),
    path(
        "verify-email/<uidb64>/<token>/",
        views.VerifyEmailView.as_view(),
        name="verify-email",
    ),
    path("logout/", views.CustomLogoutView.as_view(), name="logout"),
    path(
        "password/change/",
        views.CustomPasswordChangeView.as_view(),
        name="password-change",
    ),
    # User management (admin only)
    path("users/", views.UserListView.as_view(), name="user-list"),
    path("users/create/", views.UserCreateView.as_view(), name="user-create"),
    path(
        "users/<uuid:pk>/edit/",
        views.UserUpdateView.as_view(),
        name="user-edit",
    ),
]
