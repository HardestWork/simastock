"""Serializers for the boutique management system API v1."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from stores.models import (
    AuditLog,
    BillingModule,
    BillingPlan,
    BillingPlanModule,
    Enterprise,
    EnterprisePlanAssignment,
    EnterpriseSubscription,
    Store,
    StoreModuleEntitlement,
    StoreUser,
)
from catalog.models import Brand, Category, Product, ProductImage, ProductSpec
from stock.models import (
    InventoryMovement, ProductStock,
    StockTransfer, StockTransferLine,
    StockCount, StockCountLine,
)
from customers.models import Customer
from sales.models import Quote, QuoteItem, Refund, Sale, SaleItem
from cashier.models import CashShift, Payment
from credits.models import CustomerAccount, CreditLedgerEntry, PaymentSchedule
from purchases.models import Supplier, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine
from accounts.models import CustomRole
from alerts.models import Alert
from reports.models import KPISnapshot

User = get_user_model()


def _serializer_user_enterprise_id(user):
    """Best-effort enterprise resolution for serializer-level validation."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    link = (
        user.store_users
        .filter(store__is_active=True, store__enterprise__is_active=True)
        .order_by("-is_default", "store_id")
        .select_related("store__enterprise")
        .first()
    )
    if not link or not link.store:
        return None
    return link.store.enterprise_id


# ---------------------------------------------------------------------------
# Custom Role Serializer
# ---------------------------------------------------------------------------

class CustomRoleSerializer(serializers.ModelSerializer):
    """Serializer for CustomRole model."""

    class Meta:
        model = CustomRole
        fields = [
            'id', 'enterprise', 'name', 'base_role',
            'description', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'enterprise', 'created_at']


# ---------------------------------------------------------------------------
# User Serializers
# ---------------------------------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    """Read serializer for User model."""

    custom_role_name = serializers.CharField(
        source='custom_role.name', read_only=True, default=None,
    )

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'phone', 'role', 'custom_role', 'custom_role_name',
            'is_active',
        ]
        read_only_fields = ['id', 'role']

    def update(self, instance, validated_data):
        custom_role = validated_data.get('custom_role')
        if custom_role:
            validated_data['role'] = custom_role.base_role
        return super().update(instance, validated_data)


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new user with password confirmation."""

    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'phone', 'role', 'custom_role', 'is_active',
            'password', 'password_confirm',
        ]
        read_only_fields = ['id']

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate_role(self, value):
        """Enforce role hierarchy: only superusers can create ADMIN users."""
        request = self.context.get('request')
        if not request:
            return value
        creator = request.user
        if value == 'ADMIN' and not getattr(creator, 'is_superuser', False):
            raise serializers.ValidationError(
                "Seuls les superadmins peuvent creer des utilisateurs ADMIN."
            )
        if getattr(creator, 'role', None) == 'MANAGER' and value not in ('SALES', 'CASHIER', 'STOCKER'):
            raise serializers.ValidationError(
                "Les managers ne peuvent creer que des utilisateurs SALES, CASHIER ou STOCKER."
            )
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'password_confirm': 'Les mots de passe ne correspondent pas.'}
            )
        # Sync role from custom_role
        custom_role = attrs.get('custom_role')
        if custom_role:
            attrs['role'] = custom_role.base_role
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


# ---------------------------------------------------------------------------
# Store Serializers
# ---------------------------------------------------------------------------

class EnterpriseSerializer(serializers.ModelSerializer):
    """Serializer for Enterprise model."""

    analytics_feature_flags = serializers.JSONField(required=False)
    effective_feature_flags = serializers.JSONField(read_only=True)

    subscription_status = serializers.CharField(read_only=True)

    class Meta:
        model = Enterprise
        fields = [
            'id', 'name', 'code', 'legal_name', 'registration_number',
            'tax_id', 'currency', 'vat_enabled', 'vat_rate',
            'email', 'phone', 'website', 'is_active',
            'bank_details', 'invoice_header', 'invoice_template',
            'invoice_primary_color', 'invoice_secondary_color',
            'offer_validity_days', 'invoice_terms', 'invoice_footer',
            'analytics_feature_flags', 'effective_feature_flags',
            'can_create_stores',
            'subscription_start', 'subscription_end', 'subscription_status',
        ]
        read_only_fields = ['id', 'subscription_status']

    def validate_analytics_feature_flags(self, value):
        from stores.models import FEATURE_FLAG_DEFAULTS
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("analytics_feature_flags doit etre un objet JSON.")
        cleaned = {}
        for key, raw in value.items():
            if key not in FEATURE_FLAG_DEFAULTS:
                raise serializers.ValidationError(f"Flag inconnu: {key}")
            if not isinstance(raw, bool):
                raise serializers.ValidationError(f"Le flag '{key}' doit etre un booleen.")
            cleaned[key] = raw
        return cleaned


class EnterpriseSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer for enterprise subscriptions (billing contracts)."""

    is_current = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    enterprise = serializers.PrimaryKeyRelatedField(
        queryset=Enterprise.objects.all(),
        required=False,
    )

    class Meta:
        model = EnterpriseSubscription
        fields = [
            'id', 'enterprise',
            'plan_code', 'plan_name',
            'billing_cycle', 'amount', 'currency',
            'starts_on', 'ends_on',
            'status', 'auto_renew',
            'external_subscription_id', 'metadata',
            'is_current', 'is_expired',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_current', 'is_expired', 'created_at', 'updated_at']

    def get_is_current(self, obj):
        return obj.is_current

    def get_is_expired(self, obj):
        return obj.is_expired

    def validate_amount(self, value):
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Le montant ne peut pas etre negatif.")
        return value

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        starts_on = attrs.get("starts_on", getattr(instance, "starts_on", None))
        ends_on = attrs.get("ends_on", getattr(instance, "ends_on", None))
        if starts_on and ends_on and ends_on < starts_on:
            raise serializers.ValidationError(
                {"ends_on": "La date de fin doit etre superieure ou egale a la date de debut."}
            )

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return attrs
        if request.user.is_superuser:
            return attrs

        user_enterprise_id = _serializer_user_enterprise_id(request.user)
        if user_enterprise_id is None:
            raise serializers.ValidationError(
                "Aucune entreprise active n'est associee a votre compte."
            )

        requested_enterprise = attrs.get("enterprise")
        if requested_enterprise and requested_enterprise.pk != user_enterprise_id:
            raise serializers.ValidationError(
                {"enterprise": "Vous ne pouvez gerer que les abonnements de votre entreprise."}
            )
        return attrs


class BillingModuleSerializer(serializers.ModelSerializer):
    """Serializer for commercial billing modules."""

    class Meta:
        model = BillingModule
        fields = [
            "id",
            "code",
            "name",
            "description",
            "display_order",
            "is_active",
        ]
        read_only_fields = fields


class BillingPlanModuleSerializer(serializers.ModelSerializer):
    """Serializer for modules included in a billing plan."""

    module_id = serializers.UUIDField(read_only=True)
    module_code = serializers.CharField(source="module.code", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_description = serializers.CharField(source="module.description", read_only=True)
    module_display_order = serializers.IntegerField(source="module.display_order", read_only=True)

    class Meta:
        model = BillingPlanModule
        fields = [
            "module_id",
            "module_code",
            "module_name",
            "module_description",
            "module_display_order",
            "included",
        ]
        read_only_fields = fields


class BillingPlanSerializer(serializers.ModelSerializer):
    """Serializer for commercial plans with module bundle details."""

    modules = serializers.SerializerMethodField()
    module_codes = serializers.SerializerMethodField()

    class Meta:
        model = BillingPlan
        fields = [
            "id",
            "code",
            "name",
            "description",
            "billing_cycle",
            "base_price_fcfa",
            "currency",
            "is_active",
            "module_codes",
            "modules",
        ]
        read_only_fields = fields

    def get_modules(self, obj):
        rows = obj.plan_modules.select_related("module").filter(module__is_active=True).order_by("module__display_order", "module__name")
        return BillingPlanModuleSerializer(rows, many=True).data

    def get_module_codes(self, obj):
        return list(
            obj.plan_modules
            .filter(included=True, module__is_active=True)
            .values_list("module__code", flat=True)
            .order_by("module__display_order", "module__name")
        )


class EnterprisePlanAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assigning a billing plan to an enterprise."""

    enterprise_name = serializers.CharField(source="enterprise.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    is_active_on_date = serializers.BooleanField(read_only=True)

    enterprise = serializers.PrimaryKeyRelatedField(
        queryset=Enterprise.objects.filter(is_active=True),
        required=False,
    )
    plan = serializers.PrimaryKeyRelatedField(
        queryset=BillingPlan.objects.filter(is_active=True),
    )
    source_subscription = serializers.PrimaryKeyRelatedField(
        queryset=EnterpriseSubscription.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = EnterprisePlanAssignment
        fields = [
            "id",
            "enterprise",
            "enterprise_name",
            "plan",
            "plan_code",
            "plan_name",
            "status",
            "starts_on",
            "ends_on",
            "auto_renew",
            "source_subscription",
            "is_active_on_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "enterprise_name",
            "plan_code",
            "plan_name",
            "is_active_on_date",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        starts_on = attrs.get("starts_on", getattr(instance, "starts_on", None))
        ends_on = attrs.get("ends_on", getattr(instance, "ends_on", None))
        if starts_on and ends_on and ends_on < starts_on:
            raise serializers.ValidationError(
                {"ends_on": "La date de fin doit etre superieure ou egale a la date de debut."}
            )
        return attrs


class StoreModuleEntitlementSerializer(serializers.ModelSerializer):
    """Serializer for per-store module overrides."""

    store_name = serializers.CharField(source="store.name", read_only=True)
    module_code = serializers.CharField(source="module.code", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    created_by_email = serializers.CharField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = StoreModuleEntitlement
        fields = [
            "id",
            "store",
            "store_name",
            "module",
            "module_code",
            "module_name",
            "state",
            "reason",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "store_name",
            "module_code",
            "module_name",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        ]


class StoreModuleOverrideItemSerializer(serializers.Serializer):
    """Input item for bulk module override updates."""

    module_code = serializers.SlugRelatedField(
        source="module",
        slug_field="code",
        queryset=BillingModule.objects.filter(is_active=True),
    )
    state = serializers.ChoiceField(choices=StoreModuleEntitlement.State.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class StoreModuleEntitlementBulkUpsertSerializer(serializers.Serializer):
    """Bulk upsert payload for store module overrides."""

    store = serializers.PrimaryKeyRelatedField(queryset=Store.objects.filter(is_active=True))
    overrides = StoreModuleOverrideItemSerializer(many=True, allow_empty=False)

class EnterpriseSetupSerializer(serializers.Serializer):
    """Flat serializer for one-step enterprise + store + admin user creation.

    ``user_password`` is optional: when omitted, backend generates a secure
    password and emails credentials to the created admin user.
    """

    # Enterprise
    enterprise_name = serializers.CharField(max_length=255)
    enterprise_code = serializers.CharField(max_length=50)
    enterprise_currency = serializers.CharField(max_length=10, required=False, default='FCFA')
    enterprise_email = serializers.EmailField(required=False, allow_blank=True, default='')
    enterprise_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    can_create_stores = serializers.BooleanField(required=False, default=True)
    subscription_start = serializers.DateField(required=False, allow_null=True, default=None)
    subscription_end = serializers.DateField(required=False, allow_null=True, default=None)

    # Store
    store_name = serializers.CharField(max_length=255)
    store_code = serializers.CharField(max_length=50)
    store_address = serializers.CharField(required=False, allow_blank=True, default='')
    store_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    store_email = serializers.EmailField(required=False, allow_blank=True, default='')

    # Admin user
    user_email = serializers.EmailField()
    user_first_name = serializers.CharField(max_length=150)
    user_last_name = serializers.CharField(max_length=150)
    user_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    user_role = serializers.ChoiceField(choices=['ADMIN', 'MANAGER'], required=False, default='ADMIN')
    user_password = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')
    user_password_confirm = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')

    def validate_enterprise_code(self, value):
        if Enterprise.objects.filter(code=value).exists():
            raise serializers.ValidationError('Ce code entreprise existe deja.')
        return value

    def validate_store_code(self, value):
        if Store.objects.filter(code=value).exists():
            raise serializers.ValidationError('Ce code boutique existe deja.')
        return value

    def validate_user_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Cet email est deja utilise.')
        return value

    def validate(self, attrs):
        password = attrs.get('user_password', '')
        password_confirm = attrs.get('user_password_confirm', '')
        if password or password_confirm:
            if len(password) < 8:
                raise serializers.ValidationError(
                    {'user_password': 'Le mot de passe doit contenir au moins 8 caracteres.'}
                )
            if password != password_confirm:
                raise serializers.ValidationError(
                    {'user_password_confirm': 'Les mots de passe ne correspondent pas.'}
                )
        return attrs


class StoreSerializer(serializers.ModelSerializer):
    """Serializer for Store model."""

    analytics_feature_overrides = serializers.JSONField(required=False)
    effective_feature_flags = serializers.JSONField(read_only=True)

    class Meta:
        model = Store
        fields = [
            'id', 'enterprise', 'name', 'code', 'address', 'phone',
            'email', 'website', 'logo',
            'currency', 'vat_enabled', 'vat_rate',
            'legal_name', 'registration_number', 'tax_id', 'bank_details',
            'invoice_header', 'invoice_template', 'invoice_primary_color', 'invoice_secondary_color',
            'offer_validity_days', 'invoice_terms', 'invoice_footer',
            'analytics_feature_overrides', 'effective_feature_flags',
            'is_active',
        ]
        read_only_fields = ['id', 'enterprise']

    def validate_analytics_feature_overrides(self, value):
        from stores.models import FEATURE_FLAG_DEFAULTS
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("analytics_feature_overrides doit etre un objet JSON.")
        cleaned = {}
        for key, raw in value.items():
            if key not in FEATURE_FLAG_DEFAULTS:
                raise serializers.ValidationError(f"Flag inconnu: {key}")
            if not isinstance(raw, bool):
                raise serializers.ValidationError(f"Le flag '{key}' doit etre un booleen.")
            cleaned[key] = raw
        return cleaned


# ---------------------------------------------------------------------------
# Catalog Serializers
# ---------------------------------------------------------------------------

class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category model."""

    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)

    class Meta:
        model = Category
        fields = ['id', 'enterprise', 'name', 'slug', 'description', 'parent', 'parent_name', 'is_active']
        read_only_fields = ['id', 'enterprise', 'slug', 'parent_name']


class BrandSerializer(serializers.ModelSerializer):
    """Serializer for Brand model."""

    class Meta:
        model = Brand
        fields = ['id', 'enterprise', 'name', 'slug', 'is_active']
        read_only_fields = ['id', 'enterprise', 'slug']


class ProductImageSerializer(serializers.ModelSerializer):
    """Serializer for ProductImage model."""

    class Meta:
        model = ProductImage
        fields = ['id', 'product', 'image', 'is_primary', 'sort_order']
        read_only_fields = ['id']


class ProductSpecSerializer(serializers.ModelSerializer):
    """Serializer for ProductSpec (key/value specifications)."""

    class Meta:
        model = ProductSpec
        fields = ['id', 'product', 'key', 'value']
        read_only_fields = ['id']


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Product model with nested images and specs."""

    images = ProductImageSerializer(many=True, read_only=True)
    specs = ProductSpecSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = Product
        fields = [
            'id', 'enterprise', 'name', 'slug', 'sku', 'barcode',
            'category', 'category_name', 'brand', 'brand_name',
            'product_type', 'track_stock',
            'cost_price', 'selling_price',
            'is_active', 'images', 'specs',
        ]
        read_only_fields = ['id', 'enterprise', 'slug', 'category_name', 'brand_name']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        product_type = attrs.get(
            "product_type",
            getattr(instance, "product_type", Product.ProductType.PRODUCT),
        )
        track_stock = attrs.get(
            "track_stock",
            getattr(instance, "track_stock", True),
        )
        if product_type == Product.ProductType.SERVICE and track_stock:
            attrs["track_stock"] = False
        return attrs


class ProductPOSSerializer(serializers.ModelSerializer):
    """Lightweight product payload for POS screens.

    Includes store-scoped availability fields injected by the queryset.
    """

    available_qty = serializers.IntegerField(read_only=True)
    has_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'barcode', 'selling_price',
            'product_type', 'track_stock',
            'is_active', 'available_qty', 'has_stock',
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Stock Serializers
# ---------------------------------------------------------------------------

class ProductStockSerializer(serializers.ModelSerializer):
    """Serializer for ProductStock model."""

    available_qty = serializers.IntegerField(read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = ProductStock
        fields = [
            'id', 'store', 'product', 'product_name', 'product_sku',
            'quantity', 'reserved_qty', 'min_qty', 'available_qty',
        ]
        read_only_fields = ['id', 'quantity', 'reserved_qty', 'available_qty']


class InventoryMovementSerializer(serializers.ModelSerializer):
    """Serializer for InventoryMovement model."""

    product_name = serializers.CharField(source='product.name', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = InventoryMovement
        fields = [
            'id', 'store', 'product', 'product_name', 'movement_type',
            'quantity', 'reference', 'reason', 'actor', 'actor_name',
            'batch_id', 'created_at',
        ]
        read_only_fields = ['id', 'actor', 'created_at']

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name()
        return None


# ---------------------------------------------------------------------------
# Stock Transfer Serializers
# ---------------------------------------------------------------------------

class StockTransferLineSerializer(serializers.ModelSerializer):
    """Read serializer for transfer lines."""

    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockTransferLine
        fields = ['id', 'product', 'product_name', 'quantity', 'received_qty']
        read_only_fields = ['id', 'received_qty']


class StockTransferSerializer(serializers.ModelSerializer):
    """Read serializer for stock transfers with nested lines."""

    lines = StockTransferLineSerializer(many=True, read_only=True)
    from_store_name = serializers.CharField(source='from_store.name', read_only=True)
    to_store_name = serializers.CharField(source='to_store.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = [
            'id', 'from_store', 'from_store_name', 'to_store', 'to_store_name',
            'status', 'created_by', 'created_by_name', 'approved_by',
            'approved_by_name', 'notes', 'lines', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'from_store', 'status', 'created_by', 'approved_by',
            'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None


class _TransferLineInputSerializer(serializers.Serializer):
    """Nested line item for transfer creation."""
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class StockTransferCreateSerializer(serializers.Serializer):
    """Write serializer for creating a stock transfer."""
    to_store = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    lines = _TransferLineInputSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Au moins une ligne est requise.")
        return value


# ---------------------------------------------------------------------------
# Stock Count Serializers
# ---------------------------------------------------------------------------

class StockCountLineSerializer(serializers.ModelSerializer):
    """Serializer for count lines (counted_qty is writable)."""

    product_name = serializers.CharField(source='product.name', read_only=True)
    variance = serializers.IntegerField(read_only=True)

    class Meta:
        model = StockCountLine
        fields = ['id', 'product', 'product_name', 'system_qty', 'counted_qty', 'variance']
        read_only_fields = ['id', 'product', 'system_qty', 'variance']


class StockCountSerializer(serializers.ModelSerializer):
    """Read serializer for inventory counts with nested lines."""

    lines = StockCountLineSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockCount
        fields = [
            'id', 'store', 'status', 'created_by', 'created_by_name',
            'completed_at', 'notes', 'lines', 'created_at',
        ]
        read_only_fields = ['id', 'store', 'status', 'created_by', 'completed_at', 'created_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class StockCountCreateSerializer(serializers.Serializer):
    """Write serializer for creating an inventory count."""
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class _CountLineUpdateSerializer(serializers.Serializer):
    """Single line update inside bulk update."""
    id = serializers.UUIDField()
    counted_qty = serializers.IntegerField(min_value=0)


class StockCountUpdateLinesSerializer(serializers.Serializer):
    """Bulk update counted quantities."""
    lines = _CountLineUpdateSerializer(many=True)


# ---------------------------------------------------------------------------
# Bulk Stock Entry / Adjust Serializers
# ---------------------------------------------------------------------------

class _StockEntryItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class BulkStockEntrySerializer(serializers.Serializer):
    """Batch stock entry (all quantities positive)."""
    entries = _StockEntryItemSerializer(many=True)
    reference = serializers.CharField(required=False, allow_blank=True, default='')
    reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_entries(self, value):
        if not value:
            raise serializers.ValidationError("Au moins une entree est requise.")
        return value


class _StockAdjustItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField()


class BulkStockAdjustSerializer(serializers.Serializer):
    """Batch stock adjustment (quantities can be +/-)."""
    adjustments = _StockAdjustItemSerializer(many=True)
    reason = serializers.CharField()

    def validate_adjustments(self, value):
        if not value:
            raise serializers.ValidationError("Au moins un ajustement est requis.")
        return value


# ---------------------------------------------------------------------------
# Customer Serializers
# ---------------------------------------------------------------------------

class CustomerSerializer(serializers.ModelSerializer):
    """Serializer for Customer model.

    ``enterprise`` is read-only; it is injected server-side via
    ``CustomerViewSet.perform_create``.
    """

    full_name = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'enterprise', 'first_name', 'last_name', 'phone', 'email',
            'address', 'company', 'full_name', 'is_default',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'enterprise', 'full_name', 'is_default', 'created_by', 'created_by_name', 'created_at']

    def get_created_by_name(self, obj) -> str | None:
        if obj.created_by_id is None:
            return None
        u = obj.created_by
        return u.get_full_name() or u.email


# ---------------------------------------------------------------------------
# Sale Serializers
# ---------------------------------------------------------------------------

class SaleItemSerializer(serializers.ModelSerializer):
    """Serializer for SaleItem model."""

    class Meta:
        model = SaleItem
        fields = [
            'id', 'product', 'product_name', 'unit_price',
            'quantity', 'discount_amount', 'line_total',
        ]
        read_only_fields = ['id', 'product_name', 'line_total']


class SaleSerializer(serializers.ModelSerializer):
    """Read serializer for Sale model with nested items."""

    items = SaleItemSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_is_default = serializers.SerializerMethodField()
    seller_name = serializers.SerializerMethodField()
    source_quote_number = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id', 'store', 'seller', 'seller_name', 'customer', 'customer_name',
            'customer_is_default',
            'invoice_number', 'status', 'subtotal', 'discount_amount',
            'discount_percent', 'tax_amount', 'total', 'amount_paid',
            'amount_due', 'items', 'is_credit_sale', 'notes',
            'source_quote', 'source_quote_number', 'submitted_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'invoice_number', 'subtotal', 'tax_amount', 'total',
            'amount_paid', 'amount_due', 'source_quote', 'source_quote_number',
            'submitted_at', 'created_at',
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.full_name
        return None

    def get_customer_is_default(self, obj):
        if not obj.customer:
            return False
        return bool(getattr(obj.customer, "is_default", False))

    def get_seller_name(self, obj):
        if obj.seller:
            return obj.seller.get_full_name()
        return None

    def get_source_quote_number(self, obj):
        if obj.source_quote_id:
            return getattr(obj.source_quote, "quote_number", None)
        return None


class SaleCreateSerializer(serializers.Serializer):
    """Serializer for creating a new DRAFT sale.

    ``store_id`` is validated against the requesting user's accessible
    stores inside the view (not here, because the serializer does not
    have access to the request user).
    """

    customer_id = serializers.UUIDField(required=False, allow_null=True)
    store_id = serializers.UUIDField()
    discount_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=Decimal('0.00'),
    )
    notes = serializers.CharField(required=False, default='', allow_blank=True)


class SaleAddItemSerializer(serializers.Serializer):
    """Serializer for adding an item to a draft sale."""

    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.00'),
        required=False, default=Decimal('0.00'),
    )
    unit_price_override = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, default=None,
        help_text="Prix unitaire personnalise (MANAGER/ADMIN uniquement).",
    )

    def validate_product_id(self, value):
        if not Product.objects.filter(pk=value, is_active=True).exists():
            raise serializers.ValidationError('Produit introuvable ou inactif.')
        return value


class SaleSetItemQuantitySerializer(serializers.Serializer):
    """Serializer for setting an exact item quantity on a draft sale."""

    item_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=99999)


class SaleSetItemUnitPriceSerializer(serializers.Serializer):
    """Serializer for setting an exact unit price on a draft sale item."""

    item_id = serializers.UUIDField()
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )


class SaleSubmitSerializer(serializers.Serializer):
    """Empty serializer that triggers sale submission to cashier."""
    pass


# ---------------------------------------------------------------------------
# Payment Serializers
# ---------------------------------------------------------------------------

class PaymentSerializer(serializers.ModelSerializer):
    """Read serializer for Payment model."""

    class Meta:
        model = Payment
        fields = [
            'id', 'sale', 'method', 'amount', 'reference',
            'cashier', 'shift', 'created_at',
        ]
        read_only_fields = [
            'id', 'cashier', 'shift', 'created_at',
        ]


class PaymentLineSerializer(serializers.Serializer):
    """A single payment line within a multi-payment request."""

    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(required=False, default='', allow_blank=True)


class PaymentCreateSerializer(serializers.Serializer):
    """Serializer for processing one or more payments against a sale."""

    sale_id = serializers.UUIDField()
    payments = PaymentLineSerializer(many=True, min_length=1)

    def validate_sale_id(self, value):
        try:
            sale = Sale.objects.get(pk=value)
        except Sale.DoesNotExist:
            raise serializers.ValidationError('Vente introuvable.')
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated and not request.user.is_superuser:
            has_access = StoreUser.objects.filter(user=request.user, store_id=sale.store_id).exists()
            if not has_access:
                raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        if sale.status not in (Sale.Status.PENDING_PAYMENT, Sale.Status.PARTIALLY_PAID):
            raise serializers.ValidationError(
                'Cette vente ne peut pas recevoir de paiement dans son statut actuel.'
            )
        return value

    def validate_payments(self, value):
        if not value:
            raise serializers.ValidationError('Au moins un paiement est requis.')
        return value


# ---------------------------------------------------------------------------
# Cash Shift Serializers
# ---------------------------------------------------------------------------

class CashShiftSerializer(serializers.ModelSerializer):
    """Read serializer for CashShift model with computed totals."""

    totals = serializers.SerializerMethodField()

    class Meta:
        model = CashShift
        fields = [
            'id', 'store', 'cashier', 'status', 'opened_at', 'closed_at',
            'opening_float', 'expected_cash', 'closing_cash', 'variance',
            'totals',
        ]
        read_only_fields = [
            'id', 'cashier', 'status', 'opened_at', 'closed_at',
            'expected_cash', 'variance',
        ]

    def get_totals(self, obj):
        return {
            'total_sales': str(obj.total_sales),
            'total_cash_payments': str(obj.total_cash_payments),
            'total_mobile_payments': str(obj.total_mobile_payments),
            'total_bank_payments': str(obj.total_bank_payments),
            'total_credit_payments': str(obj.total_credit_payments),
        }


class CashShiftOpenSerializer(serializers.Serializer):
    """Serializer for opening a new cash shift."""

    store = serializers.UUIDField()
    opening_float = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal('0.00'),
    )


class CashShiftCloseSerializer(serializers.Serializer):
    """Serializer for closing an open cash shift."""

    closing_cash = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal('0.00'),
    )
    notes = serializers.CharField(required=False, default='', allow_blank=True)


# ---------------------------------------------------------------------------
# Credit / Customer Account Serializers
# ---------------------------------------------------------------------------

class CustomerAccountSerializer(serializers.ModelSerializer):
    """Serializer for CustomerAccount (credit account)."""

    available_credit = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', read_only=True, default='')

    class Meta:
        model = CustomerAccount
        fields = [
            'id', 'store', 'customer', 'customer_name', 'customer_phone',
            'credit_limit', 'balance', 'available_credit', 'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'balance', 'available_credit', 'created_at']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.full_name
        return None


class CreditLedgerEntrySerializer(serializers.ModelSerializer):
    """Serializer for CreditLedgerEntry model."""

    class Meta:
        model = CreditLedgerEntry
        fields = [
            'id', 'account', 'entry_type', 'amount', 'balance_after',
            'reference', 'sale', 'notes', 'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class PaymentScheduleSerializer(serializers.ModelSerializer):
    """Serializer for PaymentSchedule model."""

    class Meta:
        model = PaymentSchedule
        fields = [
            'id', 'account', 'sale', 'due_date', 'amount_due',
            'amount_paid', 'status', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ---------------------------------------------------------------------------
# Purchases Serializers
# ---------------------------------------------------------------------------

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id", "enterprise", "name", "contact_name", "phone", "email", "address", "is_active",
        ]
        read_only_fields = ["id", "enterprise"]


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product = serializers.UUIDField(source='product_id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    remaining_qty = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id", "purchase_order", "product", "product_name",
            "product_sku", "quantity_ordered", "quantity_received", "remaining_qty",
            "unit_cost", "line_total",
        ]
        read_only_fields = ["id", "quantity_received", "line_total"]

    def get_remaining_qty(self, obj):
        remaining = int(obj.quantity_ordered) - int(obj.quantity_received)
        return remaining if remaining > 0 else 0


class _PurchaseOrderLineInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity_ordered = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )


class PurchaseOrderCreateSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    supplier = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    po_number = serializers.CharField(required=False, allow_blank=True, default="")
    submit_now = serializers.BooleanField(required=False, default=False)
    lines = _PurchaseOrderLineInputSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Au moins une ligne est requise.")
        return value


class PurchaseOrderUpdateSerializer(serializers.Serializer):
    supplier = serializers.UUIDField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = _PurchaseOrderLineInputSerializer(many=True, required=False)

    def validate_lines(self, value):
        if value is not None and not value:
            raise serializers.ValidationError("Si fourni, lines ne peut pas etre vide.")
        return value

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Aucune modification fournie.")
        return attrs


class PurchaseOrderCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "store", "supplier", "supplier_name", "created_by",
            "created_by_name", "po_number", "status", "subtotal", "notes",
            "created_at", "updated_at", "lines",
        ]
        read_only_fields = ["id", "created_by", "status", "subtotal"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class _GoodsReceiptLineInputSerializer(serializers.Serializer):
    purchase_order_line_id = serializers.UUIDField()
    quantity_received = serializers.IntegerField(min_value=1)


class GoodsReceiptCreateSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    purchase_order = serializers.UUIDField()
    receipt_number = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = _GoodsReceiptLineInputSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Au moins une ligne de reception est requise.")
        return value


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="purchase_order_line.product.name", read_only=True)
    product_sku = serializers.CharField(source="purchase_order_line.product.sku", read_only=True)
    quantity_ordered = serializers.IntegerField(source="purchase_order_line.quantity_ordered", read_only=True)
    quantity_received_total = serializers.IntegerField(source="purchase_order_line.quantity_received", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "receipt",
            "purchase_order_line",
            "product_name",
            "product_sku",
            "quantity_ordered",
            "quantity_received",
            "quantity_received_total",
        ]
        read_only_fields = ["id"]


class GoodsReceiptSerializer(serializers.ModelSerializer):
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)
    purchase_order_number = serializers.CharField(source="purchase_order.po_number", read_only=True)

    class Meta:
        model = GoodsReceipt
        fields = [
            "id", "store", "purchase_order", "received_by",
            "purchase_order_number", "receipt_number", "notes", "created_at", "lines",
        ]
        read_only_fields = ["id", "received_by", "created_at"]


# ---------------------------------------------------------------------------
# Alert Serializers
# ---------------------------------------------------------------------------

class AlertSerializer(serializers.ModelSerializer):
    """Read-only serializer for Alert model.

    Alerts are created by Celery tasks / service functions, not via the
    API.  The viewset only exposes list, retrieve and mark-read actions.
    """

    class Meta:
        model = Alert
        fields = [
            'id', 'store', 'alert_type', 'severity', 'title',
            'message', 'is_read', 'created_at',
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# KPI / Report Serializers
# ---------------------------------------------------------------------------

class KPISerializer(serializers.Serializer):
    """Serializer for dashboard KPI data (not model-bound)."""

    total_sales = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_orders = serializers.IntegerField()
    average_basket = serializers.DecimalField(max_digits=14, decimal_places=2)
    gross_margin = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_discounts = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_refunds = serializers.DecimalField(max_digits=14, decimal_places=2)
    net_sales = serializers.DecimalField(max_digits=14, decimal_places=2)
    credit_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    top_products = serializers.ListField(child=serializers.DictField(), required=False)
    sales_trend = serializers.ListField(child=serializers.DictField(), required=False)


# ---------------------------------------------------------------------------
# Me (Profile) Serializers
# ---------------------------------------------------------------------------

class MeSerializer(serializers.ModelSerializer):
    """Serializer for the authenticated user's own profile (GET/PATCH).

    Includes ``is_superuser`` because this is the user's own data (safe).
    The general UserSerializer does NOT expose is_superuser to prevent
    enumeration of privileged accounts.
    """

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'phone', 'role', 'is_active', 'is_superuser',
        ]
        read_only_fields = ['id', 'email', 'role', 'is_active', 'is_superuser']


# ---------------------------------------------------------------------------
# Custom JWT Serializer (includes user data in token response)
# ---------------------------------------------------------------------------

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Extends JWT token response to include user profile data."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = MeSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for changing password."""

    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, min_length=8, write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Mot de passe actuel incorrect.')
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        user = self.context['request'].user
        try:
            validate_password(value, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


# ---------------------------------------------------------------------------
# My Stores Serializer
# ---------------------------------------------------------------------------

class MyStoreSerializer(serializers.ModelSerializer):
    """Store serializer with ``is_default`` and ``enterprise_name``."""

    is_default = serializers.SerializerMethodField()
    enterprise_name = serializers.CharField(source='enterprise.name', read_only=True)

    my_capabilities = serializers.SerializerMethodField()
    effective_feature_flags = serializers.JSONField(read_only=True)

    class Meta:
        model = Store
        fields = [
            'id', 'enterprise', 'name', 'code', 'address', 'phone',
            'email', 'currency', 'vat_enabled', 'vat_rate', 'is_active',
            'is_default', 'enterprise_name', 'my_capabilities',
            'effective_feature_flags',
        ]
        read_only_fields = fields

    def get_is_default(self, obj):
        annotated_value = getattr(obj, "is_default_for_user", None)
        if annotated_value is not None:
            return bool(annotated_value)
        request = self.context.get('request')
        if request and request.user:
            su = StoreUser.objects.filter(
                user=request.user, store=obj,
            ).first()
            return su.is_default if su else False
        return False

    def get_my_capabilities(self, obj):
        request = self.context.get('request')
        if not request or not request.user:
            return []
        su = StoreUser.objects.filter(store=obj, user=request.user).first()
        if su:
            return su.get_effective_capabilities()
        if request.user.role in ('ADMIN', 'MANAGER'):
            from stores.capabilities import ALL_CAPABILITIES
            return list(ALL_CAPABILITIES)
        return []


# ---------------------------------------------------------------------------
# StoreUser Serializer (capabilities management)
# ---------------------------------------------------------------------------

class StoreUserSerializer(serializers.ModelSerializer):
    """Serializer for StoreUser with capability management."""

    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_role = serializers.CharField(source='user.role', read_only=True)
    effective_capabilities = serializers.SerializerMethodField()

    class Meta:
        model = StoreUser
        fields = [
            'id', 'store', 'user', 'user_email', 'user_name',
            'user_role', 'is_default', 'capabilities', 'effective_capabilities',
        ]
        read_only_fields = ['id', 'store', 'user', 'user_email', 'user_name', 'user_role', 'effective_capabilities']

    def get_user_name(self, obj):
        return obj.user.get_full_name()

    def get_effective_capabilities(self, obj):
        return obj.get_effective_capabilities()

    def validate_capabilities(self, value):
        from stores.capabilities import ALL_CAPABILITIES
        if not isinstance(value, list):
            raise serializers.ValidationError("Les capacites doivent etre une liste.")
        invalid = [c for c in value if c not in ALL_CAPABILITIES]
        if invalid:
            raise serializers.ValidationError(
                f"Capacites invalides : {', '.join(invalid)}"
            )
        # Normalize: unique + stable order
        normalized = []
        for c in value:
            if c not in normalized:
                normalized.append(c)
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)

        # When advanced permissions are disabled, StoreUser.capabilities should
        # not be editable (it won't be used anyway; enforcing prevents confusion).
        instance = getattr(self, "instance", None)
        store = getattr(instance, "store", None)
        if store and not store.is_feature_enabled("advanced_permissions"):
            if "capabilities" in attrs and attrs.get("capabilities"):
                raise serializers.ValidationError({
                    "capabilities": "Activez d'abord le flag 'Permissions avancees (capacites)' pour cette boutique.",
                })

        return attrs


# ---------------------------------------------------------------------------
# Refund Serializer
# ---------------------------------------------------------------------------

class RefundSerializer(serializers.ModelSerializer):
    """Serializer for Refund model."""

    class Meta:
        model = Refund
        fields = [
            'id', 'sale', 'store', 'amount', 'reason',
            'approved_by', 'processed_by', 'refund_method',
            'reference', 'created_at',
        ]
        read_only_fields = ['id', 'store', 'approved_by', 'processed_by', 'created_at']


class RefundCreateSerializer(serializers.Serializer):
    """Serializer for creating a refund against a sale."""

    sale_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    reason = serializers.CharField()
    refund_method = serializers.ChoiceField(choices=Refund.Method.choices)

    def validate_sale_id(self, value):
        try:
            sale = Sale.objects.get(pk=value)
        except Sale.DoesNotExist:
            raise serializers.ValidationError('Vente introuvable.')
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated and not request.user.is_superuser:
            has_access = StoreUser.objects.filter(user=request.user, store_id=sale.store_id).exists()
            if not has_access:
                raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        if sale.status not in (Sale.Status.PAID, Sale.Status.PARTIALLY_PAID):
            raise serializers.ValidationError(
                'Seules les ventes payees peuvent recevoir un remboursement.'
            )
        return value


# ---------------------------------------------------------------------------
# Quote (Devis) Serializers
# ---------------------------------------------------------------------------

class QuoteItemSerializer(serializers.ModelSerializer):
    """Serializer for QuoteItem (line items on a quote)."""

    class Meta:
        model = QuoteItem
        fields = [
            'id', 'product', 'product_name', 'unit_price',
            'quantity', 'discount_amount', 'line_total',
        ]
        read_only_fields = ['id', 'product_name', 'line_total']


class QuoteSerializer(serializers.ModelSerializer):
    """Read serializer for Quote model with nested items."""

    items = QuoteItemSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    converted_sale_id = serializers.UUIDField(
        source='converted_sale.id', read_only=True, default=None,
    )
    converted_sale_invoice = serializers.CharField(
        source='converted_sale.invoice_number', read_only=True, default=None,
    )

    class Meta:
        model = Quote
        fields = [
            'id', 'store', 'created_by', 'created_by_name',
            'customer', 'customer_name',
            'quote_number', 'status',
            'subtotal', 'discount_amount', 'discount_percent',
            'tax_amount', 'total',
            'valid_until', 'notes', 'conditions', 'refusal_reason',
            'sent_at', 'accepted_at', 'refused_at', 'converted_at',
            'converted_sale_id', 'converted_sale_invoice',
            'is_expired', 'items',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'quote_number', 'subtotal', 'tax_amount', 'total',
            'sent_at', 'accepted_at', 'refused_at', 'converted_at',
            'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.full_name
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name()
        return None

    def get_is_expired(self, obj):
        return obj.is_expired()


class QuoteCreateSerializer(serializers.Serializer):
    """Serializer for creating a new DRAFT quote."""

    store_id = serializers.UUIDField()
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    discount_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=Decimal('0.00'),
    )
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    conditions = serializers.CharField(required=False, default='', allow_blank=True)
    valid_until = serializers.DateField(required=False, allow_null=True, default=None)


class QuoteAddItemSerializer(serializers.Serializer):
    """Serializer for adding an item to a draft quote."""

    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.00'),
        required=False, default=Decimal('0.00'),
    )
    unit_price_override = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, default=None,
    )

    def validate_product_id(self, value):
        if not Product.objects.filter(pk=value, is_active=True).exists():
            raise serializers.ValidationError('Produit introuvable ou inactif.')
        return value


# ---------------------------------------------------------------------------
# AuditLog Serializer
# ---------------------------------------------------------------------------

class AuditLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for AuditLog model."""

    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_name', 'store', 'action',
            'entity_type', 'entity_id', 'before_json', 'after_json',
            'ip_address', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name()
        return None
