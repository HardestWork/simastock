"""Cashier analytics engine — computes reliability scores, KPIs and anomalies from CashShift/Payment data."""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone as dt_timezone

from django.db.models import Avg, Count, Sum, Q, F, ExpressionWrapper, DurationField
from django.utils import timezone


class CashierAnalyticsEngine:
    """Compute cashier performance metrics for a given store + period."""

    def __init__(self, store_id: str):
        self.store_id = store_id

    def _period_bounds(self, period: str):
        year, month = int(period[:4]), int(period[5:7])
        start = datetime(year, month, 1, tzinfo=dt_timezone.utc)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=dt_timezone.utc)
        else:
            end = datetime(year, month + 1, 1, tzinfo=dt_timezone.utc)
        return start, end

    def _get_shifts(self, cashier_id: str, period: str):
        from cashier.models import CashShift
        start, end = self._period_bounds(period)
        return CashShift.objects.filter(store_id=self.store_id, cashier_id=cashier_id, opened_at__gte=start, opened_at__lt=end)

    def _get_payments(self, cashier_id: str, period: str):
        from cashier.models import Payment
        start, end = self._period_bounds(period)
        return Payment.objects.filter(store_id=self.store_id, cashier_id=cashier_id, created_at__gte=start, created_at__lt=end)

    def compute_kpis(self, cashier_id: str, period: str) -> dict:
        from cashier.models import CashShift, Payment
        from sales.models import Sale
        shifts = self._get_shifts(cashier_id, period)
        payments = self._get_payments(cashier_id, period)
        shift_count = shifts.count()
        closed_shifts = shifts.filter(status='CLOSED')
        total_collected = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        transaction_count = payments.count()
        avg_shift_duration_h = 0.0
        if closed_shifts.exists():
            durations = []
            for s in closed_shifts.exclude(closed_at=None):
                diff = (s.closed_at - s.opened_at).total_seconds() / 3600
                durations.append(diff)
            if durations:
                avg_shift_duration_h = round(sum(durations) / len(durations), 2)
        variance_total = closed_shifts.filter(variance__isnull=False).aggregate(v=Sum('variance'))['v'] or Decimal('0')
        total_expected = closed_shifts.filter(expected_cash__gt=0).aggregate(e=Sum('expected_cash'))['e'] or Decimal('0')
        variance_rate = float(abs(variance_total) / total_expected * 100) if total_expected else 0.0
        avg_delay_seconds = 0.0
        payment_qs = payments.filter(
            sale__submitted_at__isnull=False,
            sale__status__in=['PAID', 'PARTIALLY_PAID'],
        ).annotate(
            delay=ExpressionWrapper(F('created_at') - F('sale__submitted_at'), output_field=DurationField()),
        ).aggregate(avg_delay=Avg('delay'))
        raw_avg = payment_qs['avg_delay']
        if raw_avg:
            avg_delay_seconds = raw_avg.total_seconds()
        refund_count = Sale.objects.filter(
            store_id=self.store_id, status='REFUNDED',
            payments__cashier_id=cashier_id,
            payments__created_at__gte=self._period_bounds(period)[0],
            payments__created_at__lt=self._period_bounds(period)[1],
        ).distinct().count()
        return {'shift_count': shift_count, 'closed_shifts': closed_shifts.count(), 'total_collected': str(total_collected), 'transaction_count': transaction_count, 'avg_shift_duration_h': avg_shift_duration_h, 'variance_total': str(variance_total), 'variance_rate': round(variance_rate, 2), 'avg_delay_seconds': round(avg_delay_seconds, 1), 'avg_delay_minutes': round(avg_delay_seconds / 60, 2), 'refund_count': refund_count}

    def compute_reliability_score(self, cashier_id: str, period: str, kpis: dict | None = None) -> dict:
        if kpis is None:
            kpis = self.compute_kpis(cashier_id, period)
        variance_rate = kpis['variance_rate']
        avg_delay_min = kpis['avg_delay_minutes']
        transaction_count = kpis['transaction_count']
        shift_count = kpis['shift_count']
        refund_count = kpis['refund_count']
        precision = max(0.0, 40.0 * (1 - min(variance_rate / 10.0, 1.0)))
        if avg_delay_min == 0 and transaction_count == 0:
            speed = 25.0
        elif avg_delay_min < 0.5:
            speed = 10.0
        elif avg_delay_min <= 8.0:
            speed = 25.0 * (1 - abs(avg_delay_min - 3.0) / 8.0)
            speed = max(15.0, min(25.0, speed))
        elif avg_delay_min <= 20.0:
            speed = max(0.0, 25.0 * (1 - (avg_delay_min - 8.0) / 12.0))
        else:
            speed = 0.0
        tx_per_shift = transaction_count / max(shift_count, 1)
        volume = min(20.0, 20.0 * (tx_per_shift / 10.0))
        reliability = max(0.0, 15.0 * (1 - min(refund_count / 5.0, 1.0)))
        total = round(precision + speed + volume + reliability, 1)
        total = min(100.0, max(0.0, total))
        if total >= 85:
            segment = 'FIABLE'
        elif total >= 65:
            segment = 'SOLIDE'
        elif total >= 45:
            segment = 'FRAGILE'
        else:
            segment = 'RISQUE'
        components = [('precision', precision, 40.0, 'Réduire les écarts de caisse en recomptant soigneusement à la clôture'), ('speed', speed, 25.0, 'Maintenir un délai de traitement entre 1 et 8 minutes par transaction'), ('volume', volume, 20.0, 'Augmenter le nombre de transactions traitées par shift'), ('reliability', reliability, 15.0, 'Réduire le nombre de remboursements — vérifier les validations')]
        components.sort(key=lambda c: c[1] / c[2])
        actions = [c[3] for c in components[:3]]
        return {'total': total, 'segment': segment, 'precision': round(precision, 1), 'speed': round(speed, 1), 'volume': round(volume, 1), 'reliability': round(reliability, 1), 'actions': actions}

    def compute_anomalies(self, cashier_id: str, period: str, kpis: dict | None = None) -> dict:
        if kpis is None: kpis = self.compute_kpis(cashier_id, period)
        anomalies = []
        if kpis['variance_rate'] > 5.0: anomalies.append({'type': 'HIGH_VARIANCE', 'label': 'Écart de caisse élevé', 'value': round(kpis['variance_rate'], 1), 'threshold': 5.0, 'unit': '%'})
        if 0 < kpis['avg_delay_seconds'] < 30 and kpis['transaction_count'] >= 3: anomalies.append({'type': 'FAST_PAYMENT', 'label': 'Validation trop rapide (risque contrôle insuffisant)', 'value': round(kpis['avg_delay_seconds'], 0), 'threshold': 30, 'unit': 's'})
        if kpis['avg_delay_minutes'] > 15 and kpis['transaction_count'] >= 3: anomalies.append({'type': 'SLOW_PAYMENT', 'label': 'Délai de traitement trop long', 'value': round(kpis['avg_delay_minutes'], 1), 'threshold': 15, 'unit': 'min'})
        if kpis['refund_count'] > 3: anomalies.append({'type': 'HIGH_REFUNDS', 'label': 'Pic de remboursements inhabituels', 'value': kpis['refund_count'], 'threshold': 3, 'unit': ''})
        if kpis['avg_shift_duration_h'] > 12 and kpis['shift_count'] >= 2: anomalies.append({'type': 'LONG_SHIFTS', 'label': 'Durée moyenne de shift excessive', 'value': round(kpis['avg_shift_duration_h'], 1), 'threshold': 12, 'unit': 'h'})
        risk_score = len(anomalies) * 20
        return {'risk_score': risk_score, 'anomalies': anomalies}

    def compute_payment_methods(self, cashier_id: str, period: str) -> dict:
        from cashier.models import Payment
        METHOD_LABELS = {'CASH': 'Espèces', 'MOBILE_MONEY': 'Mobile Money', 'BANK_TRANSFER': 'Virement', 'CREDIT': 'Crédit', 'CHEQUE': 'Chèque'}
        payments = self._get_payments(cashier_id, period)
        total = payments.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        by_method = []
        for row in payments.values('method').annotate(amount=Sum('amount'), count=Count('id')).order_by('-amount'):
            method = row['method']
            amt = row['amount'] or Decimal('0')
            by_method.append({'method': method, 'label': METHOD_LABELS.get(method, method), 'amount': str(amt), 'count': row['count'], 'percentage': round(float(amt / total * 100), 1) if total else 0.0})
        return {'total': str(total), 'by_method': by_method}

    def compute_shift_history(self, cashier_id: str, period: str) -> list:
        from cashier.models import CashShift, Payment
        shifts = self._get_shifts(cashier_id, period).order_by('-opened_at')
        result = []
        for s in shifts:
            duration_h = None
            if s.closed_at:
                duration_h = round((s.closed_at - s.opened_at).total_seconds() / 3600, 2)
            total = Payment.objects.filter(shift=s).aggregate(t=Sum('amount'))['t'] or Decimal('0')
            count = Payment.objects.filter(shift=s).count()
            result.append({'id': str(s.id), 'opened_at': s.opened_at.isoformat(), 'closed_at': s.closed_at.isoformat() if s.closed_at else None, 'duration_h': duration_h, 'status': s.status, 'total_collected': str(total), 'transaction_count': count, 'expected_cash': str(s.expected_cash), 'closing_cash': str(s.closing_cash) if s.closing_cash is not None else None, 'variance': str(s.variance) if s.variance is not None else None})
        return result

    def compute_team_overview(self, period: str) -> list:
        from cashier.models import CashShift
        from django.contrib.auth import get_user_model
        User = get_user_model()
        start, end = self._period_bounds(period)
        cashier_ids = CashShift.objects.filter(store_id=self.store_id, opened_at__gte=start, opened_at__lt=end).values_list('cashier_id', flat=True).distinct()
        team = []
        for uid in cashier_ids:
            try:
                user = User.objects.get(id=uid)
            except User.DoesNotExist:
                continue
            kpis = self.compute_kpis(str(uid), period)
            score = self.compute_reliability_score(str(uid), period, kpis)
            anomalies = self.compute_anomalies(str(uid), period, kpis)
            methods = self.compute_payment_methods(str(uid), period)
            team.append({'cashier_id': str(uid), 'cashier_name': user.get_full_name() or user.email, 'kpis': kpis, 'score': score, 'anomalies': anomalies, 'payment_methods': methods})
        team.sort(key=lambda x: x['score']['total'], reverse=True)
        return team
