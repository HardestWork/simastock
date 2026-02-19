import pytest
from decimal import Decimal
from cashier.services import open_shift, close_shift
from cashier.models import CashShift


@pytest.mark.django_db
class TestCashShift:
    def test_open_shift(self, store, cashier_user):
        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal('100000'))
        assert shift.status == 'OPEN'
        assert shift.opening_float == Decimal('100000')
        assert shift.cashier == cashier_user

    def test_cannot_open_two_shifts(self, store, cashier_user):
        open_shift(store=store, cashier=cashier_user, opening_float=Decimal('100000'))
        with pytest.raises(ValueError):
            open_shift(store=store, cashier=cashier_user, opening_float=Decimal('50000'))

    def test_close_shift_variance(self, store, cashier_user):
        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal('100000'))
        closed = close_shift(shift=shift, closing_cash=Decimal('95000'))
        assert closed.status == 'CLOSED'
        assert closed.closing_cash == Decimal('95000')
        # variance = closing_cash - expected_cash
        # expected_cash = opening_float + cash payments
        # With no payments: expected = 100000, closing = 95000 => variance = -5000
        assert closed.variance == Decimal('-5000')

    def test_manager_can_open_shift(self, store, manager_user):
        shift = open_shift(store=store, cashier=manager_user, opening_float=Decimal('25000'))
        assert shift.status == CashShift.Status.OPEN
        assert shift.cashier == manager_user
