import uuid

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Custom manager for the User model that uses email as the unique identifier."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("L'adresse e-mail est obligatoire.")
        email = self.normalize_email(email)
        extra_fields.setdefault("is_active", True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Le superutilisateur doit avoir is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Le superutilisateur doit avoir is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class CustomRole(models.Model):
    """Custom role that maps to one of the 5 system permission levels."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="custom_roles",
        verbose_name="structure",
    )
    name = models.CharField("nom", max_length=100)
    base_role = models.CharField(
        "niveau de permission",
        max_length=20,
        choices=[
            ("ADMIN", "Administrateur"),
            ("MANAGER", "Gestionnaire"),
            ("HR", "Ressources humaines"),
            ("COMMERCIAL", "Commercial"),
            ("SALES", "Vendeur"),
            ("CASHIER", "Caissier"),
            ("STOCKER", "Magasinier"),
        ],
        default="SALES",
    )
    description = models.TextField("description", blank=True, default="")
    is_active = models.BooleanField("actif", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("enterprise", "name")]
        ordering = ["name"]
        verbose_name = "Role personnalise"
        verbose_name_plural = "Roles personnalises"

    def __str__(self):
        return f"{self.name} ({self.get_base_role_display()})"


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model for the boutique management system.

    Uses email as the unique identifier instead of a username.
    Each user is assigned a role that determines their permissions
    and accessible features within the application.
    """

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrateur"
        MANAGER = "MANAGER", "Gestionnaire"
        HR = "HR", "Ressources humaines"
        COMMERCIAL = "COMMERCIAL", "Commercial"
        SALES = "SALES", "Vendeur"
        CASHIER = "CASHIER", "Caissier"
        STOCKER = "STOCKER", "Magasinier"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    email = models.EmailField(
        "adresse e-mail",
        unique=True,
        error_messages={
            "unique": "Un utilisateur avec cette adresse e-mail existe deja.",
        },
    )
    first_name = models.CharField("prenom", max_length=150)
    last_name = models.CharField("nom", max_length=150)
    phone = models.CharField("telephone", max_length=30, blank=True, default="")
    role = models.CharField(
        "role",
        max_length=20,
        choices=Role.choices,
        default=Role.SALES,
        db_index=True,
    )
    custom_role = models.ForeignKey(
        CustomRole,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name="role personnalise",
    )
    is_active = models.BooleanField("actif", default=True, db_index=True)
    is_staff = models.BooleanField("membre du personnel", default=False)
    date_joined = models.DateTimeField("date d'inscription", default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = "utilisateur"
        verbose_name_plural = "utilisateurs"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return self.get_full_name() or self.email

    def get_full_name(self):
        full_name = f"{self.first_name} {self.last_name}".strip()
        return full_name

    def get_short_name(self):
        return self.first_name

    # ------------------------------------------------------------------
    # Role helper properties
    # ------------------------------------------------------------------

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_manager(self):
        return self.role == self.Role.MANAGER

    @property
    def is_sales(self):
        return self.role == self.Role.SALES

    @property
    def is_hr(self):
        return self.role == self.Role.HR

    @property
    def is_commercial(self):
        return self.role == self.Role.COMMERCIAL

    @property
    def is_cashier(self):
        return self.role == self.Role.CASHIER

    @property
    def is_stocker(self):
        return self.role == self.Role.STOCKER

    @property
    def role_display(self):
        return self.get_role_display()
