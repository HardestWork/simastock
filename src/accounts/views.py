from django.contrib import messages
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.conf import settings
import logging
from smtplib import SMTPException
from django.shortcuts import redirect, render
from django.utils.encoding import force_str
from django.utils.http import url_has_allowed_host_and_scheme, urlsafe_base64_decode
from django.urls import reverse_lazy
from django.views import View
from django.views.generic import CreateView, ListView, UpdateView

from .forms import (
    LoginForm,
    PasswordChangeForm,
    PublicSignupForm,
    ResendVerificationEmailForm,
    UserCreateForm,
    UserUpdateForm,
)
from .models import User
from .services import send_verification_email

logger = logging.getLogger("boutique")


# ==================================================================
# Mixins
# ==================================================================


class AdminRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Mixin that restricts access to users with the ADMIN role."""

    def test_func(self):
        return self.request.user.is_admin

    def handle_no_permission(self):
        if not self.request.user.is_authenticated:
            return super().handle_no_permission()
        messages.error(
            self.request,
            "Vous n'avez pas les permissions necessaires pour acceder a cette page.",
        )
        return redirect("dashboard:index")


# ==================================================================
# Authentication views
# ==================================================================


class CustomLoginView(View):
    """Login view with role-based redirect after successful authentication."""

    template_name = "accounts/login.html"

    def get(self, request):
        if request.user.is_authenticated:
            return self._redirect_by_role(request.user)
        form = LoginForm()
        return render(request, self.template_name, self._context(form, request))

    def post(self, request):
        form = LoginForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            messages.success(request, f"Bienvenue, {user.get_short_name()} !")

            # Honour ?next= if present, with host validation
            next_url = request.GET.get("next") or request.POST.get("next")
            if next_url and url_has_allowed_host_and_scheme(
                next_url,
                allowed_hosts={request.get_host()},
                require_https=request.is_secure(),
            ):
                return redirect(next_url)

            return self._redirect_by_role(user)
        return render(request, self.template_name, self._context(form, request))

    @staticmethod
    def _context(form, request):
        return {
            "form": form,
            "google_auth_enabled": getattr(settings, "GOOGLE_OAUTH_ENABLED", False),
            "next_url": request.GET.get("next") or request.POST.get("next") or "",
        }

    @staticmethod
    def _redirect_by_role(user):
        """Redirect user to the appropriate dashboard based on their role."""
        if user.is_cashier:
            return redirect("cashier:dashboard")
        if user.is_sales:
            return redirect("sales:my-sales")
        # ADMIN, MANAGER, STOCKER all go to the main dashboard
        return redirect("dashboard:index")


class PublicSignupView(View):
    """Public self-signup with minimal required fields."""

    template_name = "accounts/signup.html"

    def get(self, request):
        if request.user.is_authenticated:
            return CustomLoginView._redirect_by_role(request.user)

        form = PublicSignupForm()
        return render(request, self.template_name, self._context(form, request))

    def post(self, request):
        if request.user.is_authenticated:
            return CustomLoginView._redirect_by_role(request.user)

        form = PublicSignupForm(data=request.POST)
        if form.is_valid():
            user = form.save()
            try:
                send_verification_email(request, user)
                messages.success(
                    request,
                    "Compte cree. Verifiez votre e-mail pour activer votre acces.",
                )
            except SMTPException:
                logger.exception("SMTP error while sending verification email to %s", user.email)
                messages.warning(
                    request,
                    (
                        "Compte cree, mais l'envoi d'e-mail a echoue (SMTP). "
                        "Corrigez la configuration email puis cliquez sur 'Renvoyer le lien'."
                    ),
                )
            except Exception:
                logger.exception("Unexpected error while sending verification email to %s", user.email)
                messages.warning(
                    request,
                    (
                        "Compte cree, mais l'e-mail de verification n'a pas pu etre envoye. "
                        "Vous pouvez renvoyer le lien plus tard."
                    ),
                )
            return redirect(f"{reverse_lazy('accounts:signup-pending')}?email={user.email}")

        return render(request, self.template_name, self._context(form, request))

    @staticmethod
    def _context(form, request):
        return {
            "form": form,
            "google_auth_enabled": getattr(settings, "GOOGLE_OAUTH_ENABLED", False),
            "next_url": request.GET.get("next") or request.POST.get("next") or "",
        }


class CustomLogoutView(LoginRequiredMixin, View):
    """Log the user out and redirect to the login page."""

    def get(self, request):
        logout(request)
        messages.info(request, "Vous avez ete deconnecte avec succes.")
        return redirect("accounts:login")


class SignupPendingView(View):
    """Inform the user that a verification email has been sent."""

    template_name = "accounts/signup_pending.html"

    def get(self, request):
        if request.user.is_authenticated:
            return CustomLoginView._redirect_by_role(request.user)
        email = request.GET.get("email", "")
        form = ResendVerificationEmailForm(initial={"email": email})
        return render(request, self.template_name, {"email": email, "form": form})


class ResendVerificationEmailView(View):
    """Resend verification email for inactive account."""

    def post(self, request):
        form = ResendVerificationEmailForm(data=request.POST)
        if form.is_valid():
            email = form.cleaned_data["email"]
            user = User.objects.filter(email__iexact=email, is_active=False).first()
            if user is not None:
                try:
                    send_verification_email(request, user)
                except SMTPException:
                    logger.exception("SMTP error while resending verification email to %s", email)
                    messages.error(
                        request,
                        "Envoi impossible pour le moment (SMTP). Verifiez la configuration email.",
                    )
                    return redirect("accounts:signup-pending")
                except Exception:
                    logger.exception("Unexpected error while resending verification email to %s", email)
                    messages.error(
                        request,
                        "Envoi impossible pour le moment. Veuillez reessayer plus tard.",
                    )
                    return redirect("accounts:signup-pending")

        messages.info(
            request,
            "Si le compte existe et n'est pas encore active, un e-mail de verification a ete renvoye.",
        )
        return redirect("accounts:login")


class VerifyEmailView(View):
    """Activate account from verification link."""

    def get(self, request, uidb64, token):
        user = None
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.filter(pk=uid).first()
        except (TypeError, ValueError, OverflowError):
            user = None

        if user is not None and default_token_generator.check_token(user, token):
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])
            messages.success(request, "Adresse e-mail verifiee. Vous pouvez maintenant vous connecter.")
        else:
            messages.error(request, "Lien de verification invalide ou expire.")

        return redirect("accounts:login")

    def post(self, request):
        logout(request)
        messages.info(request, "Vous avez ete deconnecte avec succes.")
        return redirect("accounts:login")


# ==================================================================
# Password change
# ==================================================================


class CustomPasswordChangeView(LoginRequiredMixin, View):
    """Allow an authenticated user to change their own password."""

    template_name = "accounts/password_change.html"

    def get(self, request):
        form = PasswordChangeForm(user=request.user)
        return render(request, self.template_name, {"form": form})

    def post(self, request):
        form = PasswordChangeForm(user=request.user, data=request.POST)
        if form.is_valid():
            user = form.save()
            # Keep the user logged in after the password change
            update_session_auth_hash(request, user)
            messages.success(request, "Votre mot de passe a ete modifie avec succes.")
            return redirect("dashboard:index")
        return render(request, self.template_name, {"form": form})


# ==================================================================
# User management (admin only)
# ==================================================================


class UserListView(AdminRequiredMixin, ListView):
    """List all users. Accessible only by admins."""

    model = User
    template_name = "accounts/user_list.html"
    context_object_name = "users"
    paginate_by = 25

    def get_queryset(self):
        from django.db.models import Count, Q

        queryset = (
            super()
            .get_queryset()
            .annotate(stores_count=Count("store_users", distinct=True))
            .order_by("last_name", "first_name", "email")
        )
        # Optional search filter
        search = self.request.GET.get("q", "").strip()
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(phone__icontains=search)
            )
        # Optional role filter
        role = self.request.GET.get("role", "").strip()
        if role and role in dict(User.Role.choices):
            queryset = queryset.filter(role=role)

        status = self.request.GET.get("status", "").strip().lower()
        if status == "active":
            queryset = queryset.filter(is_active=True)
        elif status == "inactive":
            queryset = queryset.filter(is_active=False)

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["roles"] = User.Role.choices
        context["current_role"] = self.request.GET.get("role", "")
        context["current_status"] = self.request.GET.get("status", "")
        context["search_query"] = self.request.GET.get("q", "")
        query_params = self.request.GET.copy()
        query_params.pop("page", None)
        context["query_string"] = query_params.urlencode()
        return context


class UserCreateView(AdminRequiredMixin, CreateView):
    """Create a new user. Accessible only by admins."""

    model = User
    form_class = UserCreateForm
    template_name = "accounts/user_form.html"
    success_url = reverse_lazy("accounts:user-list")

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(
            self.request,
            f"L'utilisateur {self.object.get_full_name()} a ete cree avec succes.",
        )
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "Creer un utilisateur"
        context["submit_label"] = "Creer"
        return context


class UserUpdateView(AdminRequiredMixin, UpdateView):
    """Edit an existing user. Accessible only by admins."""

    model = User
    form_class = UserUpdateForm
    template_name = "accounts/user_form.html"
    success_url = reverse_lazy("accounts:user-list")

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(
            self.request,
            f"L'utilisateur {self.object.get_full_name()} a ete mis a jour.",
        )
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "Modifier l'utilisateur"
        context["submit_label"] = "Enregistrer"
        return context
