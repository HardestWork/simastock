import pytest
from decimal import Decimal
from credits.services import record_credit_sale, record_credit_payment, check_credit_availability
from credits.models import CustomerAccount, CreditLedgerEntry


@pytest.mark.django_db
class TestCreditLedger:
    def test_credit_sale(self, store, sales_user, customer, customer_account):
        from sales.services import create_sale
        sale = create_sale(store=store, seller=sales_user, customer=customer)

        entry = record_credit_sale(
            account=customer_account,
            sale=sale,
            amount=Decimal('100000'),
            actor=sales_user
        )
        customer_account.refresh_from_db()
        assert customer_account.balance == Decimal('100000')
        assert entry.entry_type == 'SALE_ON_CREDIT'
        assert entry.balance_after == Decimal('100000')

    def test_credit_payment(self, store, sales_user, cashier_user, customer, customer_account):
        from sales.services import create_sale
        sale = create_sale(store=store, seller=sales_user, customer=customer)

        record_credit_sale(account=customer_account, sale=sale, amount=Decimal('100000'), actor=sales_user)

        entry = record_credit_payment(
            account=customer_account,
            amount=Decimal('50000'),
            reference='PAY-001',
            actor=cashier_user
        )
        customer_account.refresh_from_db()
        assert customer_account.balance == Decimal('50000')
        assert entry.entry_type == 'CREDIT_PAYMENT'
        assert entry.balance_after == Decimal('50000')

    def test_check_credit_availability(self, customer_account):
        # credit_limit is 500000, balance is 0
        assert check_credit_availability(customer_account, Decimal('400000')) is True
        assert check_credit_availability(customer_account, Decimal('600000')) is False

    def test_credit_payment_cannot_exceed_balance(
        self,
        store,
        sales_user,
        cashier_user,
        customer,
        customer_account,
    ):
        from sales.services import create_sale

        sale = create_sale(store=store, seller=sales_user, customer=customer)
        record_credit_sale(
            account=customer_account,
            sale=sale,
            amount=Decimal('20000'),
            actor=sales_user,
        )

        with pytest.raises(ValueError):
            record_credit_payment(
                account=customer_account,
                amount=Decimal('30000'),
                reference='OVERPAY-001',
                actor=cashier_user,
            )
