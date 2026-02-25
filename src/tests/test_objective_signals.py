"""Regression tests for objectives signal dispatching."""
from datetime import datetime, timezone
from types import SimpleNamespace

import objectives.tasks as objective_tasks
from objectives.signals import on_payment_saved, on_refund_saved, on_sale_saved


def _capture_delay(monkeypatch):
    calls = []

    def fake_delay(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(objective_tasks.recompute_seller_objective, "delay", fake_delay)
    return calls


def test_payment_signal_uses_payment_month(monkeypatch):
    calls = _capture_delay(monkeypatch)
    sale = SimpleNamespace(
        store_id="store-1",
        seller_id="seller-1",
        created_at=datetime(2026, 1, 31, 12, 0, tzinfo=timezone.utc),
    )
    payment = SimpleNamespace(
        sale=sale,
        created_at=datetime(2026, 2, 1, 9, 0, tzinfo=timezone.utc),
    )

    on_payment_saved(sender=None, instance=payment)

    assert len(calls) == 1
    assert calls[0]["period"] == "2026-02"
    assert calls[0]["store_id"] == "store-1"
    assert calls[0]["seller_id"] == "seller-1"


def test_sale_cancel_signal_triggers_recompute(monkeypatch):
    calls = _capture_delay(monkeypatch)
    sale = SimpleNamespace(
        store_id="store-2",
        seller_id="seller-2",
        created_at=datetime(2026, 2, 20, 16, 0, tzinfo=timezone.utc),
        status="CANCELLED",
        _previous_status="PENDING_PAYMENT",
    )

    on_sale_saved(sender=None, instance=sale, created=False)

    assert len(calls) == 1
    assert calls[0]["period"] == "2026-02"
    assert calls[0]["store_id"] == "store-2"
    assert calls[0]["seller_id"] == "seller-2"


def test_refund_signal_uses_refund_month(monkeypatch):
    calls = _capture_delay(monkeypatch)
    sale = SimpleNamespace(
        store_id="store-3",
        seller_id="seller-3",
        created_at=datetime(2026, 1, 15, 10, 0, tzinfo=timezone.utc),
    )
    refund = SimpleNamespace(
        sale=sale,
        created_at=datetime(2026, 2, 24, 8, 30, tzinfo=timezone.utc),
    )

    on_refund_saved(sender=None, instance=refund)

    assert len(calls) == 1
    assert calls[0]["period"] == "2026-02"
    assert calls[0]["store_id"] == "store-3"
    assert calls[0]["seller_id"] == "seller-3"
