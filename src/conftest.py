import pytest
from decimal import Decimal

from accounts.models import User
from stores.models import Store, StoreUser
from catalog.models import Category, Brand, Product
from stock.models import ProductStock
from customers.models import Customer
from credits.models import CustomerAccount


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@test.com",
        password="testpass123",
        first_name="Admin",
        last_name="User",
        role=User.Role.ADMIN,
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        email="manager@test.com",
        password="testpass123",
        first_name="Manager",
        last_name="User",
        role=User.Role.MANAGER,
    )


@pytest.fixture
def sales_user(db):
    return User.objects.create_user(
        email="sales@test.com",
        password="testpass123",
        first_name="Sales",
        last_name="User",
        role=User.Role.SALES,
    )


@pytest.fixture
def cashier_user(db):
    return User.objects.create_user(
        email="cashier@test.com",
        password="testpass123",
        first_name="Cashier",
        last_name="User",
        role=User.Role.CASHIER,
    )


@pytest.fixture
def store(db):
    return Store.objects.create(
        name="Boutique Test",
        code="BT-001",
        address="123 Rue de Test",
        phone="+237600000000",
        email="boutique@test.com",
    )


@pytest.fixture
def store_user_admin(store, admin_user):
    return StoreUser.objects.create(
        store=store,
        user=admin_user,
        is_default=True,
    )


@pytest.fixture
def store_user_sales(store, sales_user):
    return StoreUser.objects.create(
        store=store,
        user=sales_user,
        is_default=True,
    )


@pytest.fixture
def store_user_cashier(store, cashier_user):
    return StoreUser.objects.create(
        store=store,
        user=cashier_user,
        is_default=True,
    )


@pytest.fixture
def category(db):
    return Category.objects.create(
        name="Réseau",
        slug="reseau",
    )


@pytest.fixture
def brand(db):
    return Brand.objects.create(
        name="Cisco",
        slug="cisco",
    )


@pytest.fixture
def product(category, brand):
    return Product.objects.create(
        category=category,
        brand=brand,
        name="Switch Cisco 24 ports",
        slug="switch-cisco-24-ports",
        sku="TST-001",
        selling_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
    )


@pytest.fixture
def product_stock(store, product):
    return ProductStock.objects.create(
        store=store,
        product=product,
        quantity=100,
    )


@pytest.fixture
def customer(store):
    return Customer.objects.create(
        store=store,
        first_name="Jean",
        last_name="Dupont",
        phone="+237699999999",
        email="jean.dupont@test.com",
    )


@pytest.fixture
def customer_account(store, customer):
    return CustomerAccount.objects.create(
        store=store,
        customer=customer,
        credit_limit=Decimal("500000.00"),
        balance=Decimal("0.00"),
    )
