from django.db import transaction
from django import forms
from django.contrib.auth import password_validation
from django.contrib.auth.forms import AuthenticationForm

from .models import User
from .services import provision_enterprise_for_user


class LoginForm(AuthenticationForm):
    """Custom login form with styled widgets and French labels."""

    username = forms.EmailField(
        label="Adresse e-mail",
        widget=forms.EmailInput(
            attrs={
                "class": "form-control",
                "placeholder": "exemple@boutique.com",
                "autofocus": True,
            }
        ),
    )
    password = forms.CharField(
        label="Mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "form-control",
                "placeholder": "Mot de passe",
            }
        ),
    )

    error_messages = {
        "invalid_login": (
            "Adresse e-mail ou mot de passe incorrect. "
            "Veuillez reessayer."
        ),
        "inactive": "Ce compte est desactive.",
    }


class UserCreateForm(forms.ModelForm):
    """Form for creating a new user (admin only)."""

    password1 = forms.CharField(
        label="Mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={"class": "form-control", "placeholder": "Mot de passe"}
        ),
        help_text=password_validation.password_validators_help_text_html(),
    )
    password2 = forms.CharField(
        label="Confirmer le mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "form-control",
                "placeholder": "Confirmer le mot de passe",
            }
        ),
    )

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "phone", "role", "is_active")
        widgets = {
            "email": forms.EmailInput(
                attrs={"class": "form-control", "placeholder": "Adresse e-mail"}
            ),
            "first_name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Prenom"}
            ),
            "last_name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Nom"}
            ),
            "phone": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Telephone"}
            ),
            "role": forms.Select(attrs={"class": "form-select"}),
            "is_active": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Les deux mots de passe ne correspondent pas.")
        return password2

    def _post_clean(self):
        super()._post_clean()
        password = self.cleaned_data.get("password2")
        if password:
            try:
                password_validation.validate_password(password, self.instance)
            except forms.ValidationError as error:
                self.add_error("password2", error)

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if user.role == User.Role.ADMIN:
            user.is_staff = True
        if commit:
            user.save()
        return user


class UserUpdateForm(forms.ModelForm):
    """Form for updating an existing user (admin only). Password is not changed here."""

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "phone", "role", "is_active")
        widgets = {
            "email": forms.EmailInput(
                attrs={"class": "form-control", "placeholder": "Adresse e-mail"}
            ),
            "first_name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Prenom"}
            ),
            "last_name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Nom"}
            ),
            "phone": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Telephone"}
            ),
            "role": forms.Select(attrs={"class": "form-select"}),
            "is_active": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def save(self, commit=True):
        user = super().save(commit=False)
        # Keep is_staff in sync with ADMIN role
        user.is_staff = user.role == User.Role.ADMIN
        if commit:
            user.save()
        return user


class PasswordChangeForm(forms.Form):
    """
    Form that allows any authenticated user to change their own password.
    Requires the current password for security.
    """

    current_password = forms.CharField(
        label="Mot de passe actuel",
        strip=False,
        widget=forms.PasswordInput(
            attrs={"class": "form-control", "placeholder": "Mot de passe actuel"}
        ),
    )
    new_password1 = forms.CharField(
        label="Nouveau mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={"class": "form-control", "placeholder": "Nouveau mot de passe"}
        ),
        help_text=password_validation.password_validators_help_text_html(),
    )
    new_password2 = forms.CharField(
        label="Confirmer le nouveau mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "form-control",
                "placeholder": "Confirmer le nouveau mot de passe",
            }
        ),
    )

    def __init__(self, user, *args, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean_current_password(self):
        current_password = self.cleaned_data.get("current_password")
        if not self.user.check_password(current_password):
            raise forms.ValidationError("Le mot de passe actuel est incorrect.")
        return current_password

    def clean_new_password2(self):
        password1 = self.cleaned_data.get("new_password1")
        password2 = self.cleaned_data.get("new_password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Les deux mots de passe ne correspondent pas.")
        return password2

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("new_password2")
        if password:
            try:
                password_validation.validate_password(password, self.user)
            except forms.ValidationError as error:
                self.add_error("new_password2", error)
        return cleaned_data

    def save(self, commit=True):
        self.user.set_password(self.cleaned_data["new_password1"])
        if commit:
            self.user.save()
        return self.user


class PublicSignupForm(forms.Form):
    """Public signup form (email/password + enterprise bootstrap)."""

    company_name = forms.CharField(
        label="Nom de l'entreprise",
        required=False,
        max_length=255,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "Ex: TechShop SARL"}
        ),
    )
    store_name = forms.CharField(
        label="Nom de la premiere boutique (optionnel)",
        required=False,
        max_length=255,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "Ex: Boutique Centrale"}
        ),
    )

    email = forms.EmailField(
        label="Adresse e-mail",
        widget=forms.EmailInput(
            attrs={"class": "form-control", "placeholder": "votre@email.com"}
        ),
    )
    password1 = forms.CharField(
        label="Mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={"class": "form-control", "placeholder": "Mot de passe"}
        ),
        help_text=password_validation.password_validators_help_text_html(),
    )
    password2 = forms.CharField(
        label="Confirmer le mot de passe",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "form-control",
                "placeholder": "Confirmer le mot de passe",
            }
        ),
    )

    def clean_email(self):
        email = User.objects.normalize_email(self.cleaned_data["email"].strip())
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Un compte existe deja avec cette adresse e-mail.")
        return email

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Les deux mots de passe ne correspondent pas.")

        # Reuse Django password validators for security.
        if password2:
            draft_user = User(email=self.cleaned_data.get("email", ""))
            try:
                password_validation.validate_password(password2, draft_user)
            except forms.ValidationError as error:
                raise forms.ValidationError(error.messages) from error

        return password2

    def save(self):
        email = self.cleaned_data["email"]
        password = self.cleaned_data["password1"]
        company_name = self.cleaned_data.get("company_name", "").strip()
        store_name = self.cleaned_data.get("store_name", "").strip()

        local_part = (email.split("@", 1)[0] if "@" in email else "").strip()
        fallback_name = local_part[:150] if local_part else "Proprietaire"

        with transaction.atomic():
            if company_name:
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    first_name=fallback_name,
                    last_name="Admin",
                    role=User.Role.ADMIN,
                    is_active=False,
                    is_staff=True,
                )
                provision_enterprise_for_user(
                    user=user,
                    company_name=company_name,
                    store_name=store_name,
                )
            else:
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    first_name=fallback_name,
                    last_name="Utilisateur",
                    role=User.Role.SALES,
                    is_active=False,
                    is_staff=False,
                )
        return user


class ResendVerificationEmailForm(forms.Form):
    """Request a new email verification link."""

    email = forms.EmailField(
        label="Adresse e-mail",
        widget=forms.EmailInput(
            attrs={"class": "form-control", "placeholder": "votre@email.com"}
        ),
    )

    def clean_email(self):
        return User.objects.normalize_email(self.cleaned_data["email"].strip())
