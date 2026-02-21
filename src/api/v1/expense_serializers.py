"""Serializers dedicated to the expenses module."""
from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from expenses.models import Budget, Expense, ExpenseCategory, RecurringExpense, Wallet


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Serializer for expense categories."""

    store_name = serializers.CharField(source="store.name", read_only=True, default=None)

    class Meta:
        model = ExpenseCategory
        fields = [
            "id",
            "enterprise",
            "store",
            "store_name",
            "name",
            "type",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "enterprise", "store_name", "created_at"]


class WalletSerializer(serializers.ModelSerializer):
    """Serializer for wallets."""

    store_name = serializers.CharField(source="store.name", read_only=True, default="")
    initial_balance = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        write_only=True,
        required=False,
        default=Decimal("0.00"),
    )
    new_balance = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Wallet
        fields = [
            "id",
            "store",
            "store_name",
            "name",
            "type",
            "balance",
            "initial_balance",
            "new_balance",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "balance", "store_name", "created_at"]

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            mutable = data.copy()
        else:
            mutable = dict(data)

        for key in ("initial_balance", "new_balance"):
            raw = mutable.get(key)
            if isinstance(raw, str):
                mutable[key] = raw.replace(" ", "").replace(",", ".").strip()

        return super().to_internal_value(mutable)

    def validate_initial_balance(self, value):
        if value < 0:
            raise serializers.ValidationError("Le solde initial ne peut pas etre negatif.")
        return value

    def validate_new_balance(self, value):
        if value < 0:
            raise serializers.ValidationError("Le solde ne peut pas etre negatif.")
        return value

    def create(self, validated_data):
        initial_balance = validated_data.pop("initial_balance", Decimal("0.00"))
        validated_data.pop("new_balance", None)
        validated_data["balance"] = initial_balance
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("initial_balance", None)
        validated_data.pop("balance", None)
        new_balance = validated_data.pop("new_balance", None)
        if new_balance is not None:
            validated_data["balance"] = new_balance
        return super().update(instance, validated_data)


class ExpenseSerializer(serializers.ModelSerializer):
    """Serializer for expenses."""

    store_name = serializers.CharField(source="store.name", read_only=True, default="")
    category_name = serializers.CharField(source="category.name", read_only=True, default="")
    wallet_name = serializers.CharField(source="wallet.name", read_only=True, default="")
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default="")
    voided_by_name = serializers.CharField(source="voided_by.get_full_name", read_only=True, default="")
    is_edit_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id",
            "expense_number",
            "store",
            "store_name",
            "category",
            "category_name",
            "wallet",
            "wallet_name",
            "amount",
            "description",
            "supplier_name",
            "expense_date",
            "created_by",
            "created_by_name",
            "status",
            "posted_at",
            "voided_at",
            "voided_by",
            "voided_by_name",
            "void_reason",
            "is_edit_locked",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "expense_number",
            "store_name",
            "category_name",
            "wallet_name",
            "created_by",
            "created_by_name",
            "status",
            "posted_at",
            "voided_at",
            "voided_by",
            "voided_by_name",
            "is_edit_locked",
            "created_at",
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le montant doit etre strictement superieur a 0.")
        return value

    def validate(self, attrs):
        category = attrs.get("category")
        wallet = attrs.get("wallet")
        store = attrs.get("store")

        if self.instance is not None:
            store = store or self.instance.store
            category = category or self.instance.category
            wallet = wallet or self.instance.wallet

        if category and wallet and store:
            if category.enterprise_id != store.enterprise_id:
                raise serializers.ValidationError(
                    {"category": "La categorie n'appartient pas a l'entreprise de la boutique."}
                )
            if category.store_id and category.store_id != store.id:
                raise serializers.ValidationError(
                    {"category": "La categorie n'est pas disponible pour cette boutique."}
                )
            if wallet.store_id != store.id:
                raise serializers.ValidationError(
                    {"wallet": "Le wallet doit appartenir a la meme boutique."}
                )
        return attrs


class BudgetSerializer(serializers.ModelSerializer):
    """Serializer for monthly budgets."""

    store_name = serializers.CharField(source="store.name", read_only=True, default="")
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = Budget
        fields = [
            "id",
            "store",
            "store_name",
            "category",
            "category_name",
            "period",
            "limit_amount",
            "alert_threshold_percent",
            "created_at",
        ]
        read_only_fields = ["id", "store_name", "category_name", "created_at"]

    def to_internal_value(self, data):
        """Allow decimal payloads using French comma notation for limit_amount."""
        if hasattr(data, "copy"):
            mutable = data.copy()
        else:
            mutable = dict(data)

        raw_limit = mutable.get("limit_amount")
        if isinstance(raw_limit, str):
            normalized = raw_limit.replace(" ", "").replace(",", ".").strip()
            mutable["limit_amount"] = normalized

        return super().to_internal_value(mutable)

    def validate_period(self, value):
        if len(value or "") != 7 or value[4] != "-":
            raise serializers.ValidationError("Format periode invalide. Utilisez YYYY-MM.")
        try:
            year = int(value[0:4])
            month = int(value[5:7])
        except ValueError:
            raise serializers.ValidationError("Format periode invalide. Utilisez YYYY-MM.")
        if year < 2000 or year > 2100:
            raise serializers.ValidationError("Annee de periode invalide.")
        if month < 1 or month > 12:
            raise serializers.ValidationError("Mois de periode invalide.")
        return value

    def validate(self, attrs):
        store = attrs.get("store")
        category = attrs.get("category")

        if self.instance is not None:
            store = store or self.instance.store
            category = category or self.instance.category

        if category and store:
            if category.enterprise_id != store.enterprise_id:
                raise serializers.ValidationError(
                    {"category": "La categorie et la boutique ne sont pas de la meme entreprise."}
                )
            if category.store_id and category.store_id != store.id:
                raise serializers.ValidationError(
                    {"category": "La categorie doit etre globale ou de la meme boutique."}
                )
        return attrs


class RecurringExpenseSerializer(serializers.ModelSerializer):
    """Serializer for recurring expense templates."""

    store_name = serializers.CharField(source="store.name", read_only=True, default="")
    category_name = serializers.CharField(source="category.name", read_only=True, default="")
    wallet_name = serializers.CharField(source="wallet.name", read_only=True, default="")

    class Meta:
        model = RecurringExpense
        fields = [
            "id",
            "store",
            "store_name",
            "category",
            "category_name",
            "wallet",
            "wallet_name",
            "amount",
            "description",
            "supplier_name",
            "frequency",
            "next_run_date",
            "is_active",
            "created_by",
            "last_run_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "store_name",
            "category_name",
            "wallet_name",
            "created_by",
            "last_run_at",
            "created_at",
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le montant doit etre strictement superieur a 0.")
        return value

    def validate(self, attrs):
        store = attrs.get("store")
        category = attrs.get("category")
        wallet = attrs.get("wallet")

        if self.instance is not None:
            store = store or self.instance.store
            category = category or self.instance.category
            wallet = wallet or self.instance.wallet

        if category and store:
            if category.enterprise_id != store.enterprise_id:
                raise serializers.ValidationError(
                    {"category": "La categorie n'appartient pas a l'entreprise de la boutique."}
                )
            if category.store_id and category.store_id != store.id:
                raise serializers.ValidationError(
                    {"category": "La categorie doit etre globale ou de cette boutique."}
                )

        if wallet and store and wallet.store_id != store.id:
            raise serializers.ValidationError(
                {"wallet": "Le wallet doit appartenir a la meme boutique."}
            )

        return attrs
