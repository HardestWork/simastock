from types import SimpleNamespace

import pytest

from core.pdf import _build_payment_status_meta


@pytest.mark.parametrize(
    ("sale", "expected"),
    [
        (
            SimpleNamespace(
                status="PAID",
                payment_status="PAID",
                amount_paid=12000,
                amount_due=0,
            ),
            {"tone": "paid", "label": "PAYEE", "show_due": False, "show_paid": True},
        ),
        (
            SimpleNamespace(
                status="PARTIALLY_PAID",
                payment_status="PARTIAL",
                amount_paid=7000,
                amount_due=3000,
            ),
            {"tone": "partial", "label": "PARTIELLEMENT PAYEE", "show_due": True, "show_paid": True},
        ),
        (
            SimpleNamespace(
                status="PENDING_PAYMENT",
                payment_status="UNPAID",
                amount_paid=0,
                amount_due=5000,
            ),
            {"tone": "unpaid", "label": "IMPAYEE", "show_due": True, "show_paid": False},
        ),
        (
            SimpleNamespace(
                status="REFUNDED",
                payment_status="PAID",
                amount_paid=0,
                amount_due=0,
            ),
            {"tone": "refunded", "label": "REMBOURSEE", "show_due": False, "show_paid": False},
        ),
        (
            SimpleNamespace(
                status="CANCELLED",
                payment_status="N/A",
                amount_paid=5000,
                amount_due=0,
            ),
            {"tone": "cancelled", "label": "ANNULEE", "show_due": False, "show_paid": False},
        ),
    ],
)
def test_build_payment_status_meta_cases(sale, expected):
    meta = _build_payment_status_meta(sale)
    for key, value in expected.items():
        assert meta[key] == value
