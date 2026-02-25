"""Stock analytics engine -- computes stock health scores, rotation, dead stock and rupture risk."""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timedelta, timezone as dt_timezone

from django.db.models import Sum
from django.utils import timezone


class StockAnalyticsEngine:
    """Compute stock health metrics for a given store."""

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

    def compute_kpis(self) -> dict:
        from stock.models import ProductStock
        stocks = ProductStock.objects.filter(store_id=self.store_id).select_related('product')
        total_sku_count = stocks.count()
        total_products = stocks.filter(quantity__gt=0).count()
        low_stock_count = 0
        out_of_stock_count = stocks.filter(quantity__lte=0).count()
        stock_value = Decimal('0')
        retail_value = Decimal('0')
        for ps in stocks:
            if ps.quantity <= ps.min_qty and ps.quantity > 0:
                low_stock_count += 1
            stock_value += Decimal(str(ps.quantity)) * ps.product.cost_price
            retail_value += Decimal(str(ps.quantity)) * ps.product.selling_price
        potential_margin = retail_value - stock_value
        dead_stock_count = self._count_dead_stock(days=90)
        return {
            'total_sku_count': total_sku_count,
            'total_products': total_products,
            'total_stock_value': str(stock_value),
            'total_retail_value': str(retail_value),
            'potential_margin': str(potential_margin),
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock_count,
            'dead_stock_count': dead_stock_count,
        }

    def _count_dead_stock(self, days: int = 90) -> int:
        from stock.models import ProductStock, InventoryMovement
        cutoff = timezone.now() - timedelta(days=days)
        recently_sold_ids = set(
            InventoryMovement.objects.filter(
                store_id=self.store_id,
                movement_type='SALE',
                created_at__gte=cutoff,
            ).values_list('product_id', flat=True)
        )
        return ProductStock.objects.filter(
            store_id=self.store_id,
            quantity__gt=0,
        ).exclude(product_id__in=recently_sold_ids).count()

    def get_dead_stock(self, days: int = 90) -> list:
        from stock.models import ProductStock, InventoryMovement
        cutoff = timezone.now() - timedelta(days=days)
        recently_sold_ids = set(
            InventoryMovement.objects.filter(
                store_id=self.store_id,
                movement_type='SALE',
                created_at__gte=cutoff,
            ).values_list('product_id', flat=True)
        )
        stocks = ProductStock.objects.filter(
            store_id=self.store_id,
            quantity__gt=0,
        ).exclude(product_id__in=recently_sold_ids).select_related('product__category')
        result = []
        for ps in stocks:
            last_sale = InventoryMovement.objects.filter(
                store_id=self.store_id,
                product_id=ps.product_id,
                movement_type='SALE',
            ).order_by('-created_at').first()
            days_since = None
            last_sale_date = None
            if last_sale:
                diff = timezone.now() - last_sale.created_at
                days_since = diff.days
                last_sale_date = last_sale.created_at.isoformat()
            stock_value = Decimal(str(ps.quantity)) * ps.product.cost_price
            cat_name = ps.product.category.name if ps.product.category_id else None
            result.append({
                'product_id': str(ps.product_id),
                'product_name': ps.product.name,
                'sku': ps.product.sku,
                'category': cat_name,
                'current_qty': ps.quantity,
                'stock_value': str(stock_value),
                'days_since_last_sale': days_since,
                'last_sale_date': last_sale_date,
            })
        result.sort(key=lambda x: x['days_since_last_sale'] if x['days_since_last_sale'] is not None else 999999, reverse=True)
        return result[:20]

    def compute_rotation(self, period: str) -> dict:
        from stock.models import ProductStock, InventoryMovement
        start, end = self._period_bounds(period)
        sale_agg = {}
        for row in InventoryMovement.objects.filter(
            store_id=self.store_id,
            movement_type='SALE',
            created_at__gte=start,
            created_at__lt=end,
        ).values('product_id').annotate(sale_qty=Sum('quantity')):
            sale_agg[row['product_id']] = abs(row['sale_qty'] or 0)
        stocks = ProductStock.objects.filter(
            store_id=self.store_id,
        ).select_related('product__category', 'product__brand')
        items = []
        for ps in stocks:
            pid = ps.product_id
            sale_qty = sale_agg.get(pid, 0)
            rotation_rate = round(sale_qty / max(ps.quantity, 1), 2) if ps.quantity > 0 else 0.0
            cat_name = ps.product.category.name if ps.product.category_id else None
            brand_name = ps.product.brand.name if ps.product.brand_id else None
            items.append({
                'product_id': str(pid),
                'product_name': ps.product.name,
                'sku': ps.product.sku,
                'category': cat_name,
                'brand': brand_name,
                'current_qty': ps.quantity,
                'sale_qty': sale_qty,
                'rotation_rate': rotation_rate,
            })
        items_with_stock = [i for i in items if i['current_qty'] > 0]
        items_with_stock.sort(key=lambda x: x['rotation_rate'], reverse=True)
        top = items_with_stock[:10]
        bottom_candidates = [i for i in items_with_stock if i['sale_qty'] == 0 or i['rotation_rate'] < 0.1]
        bottom = sorted(bottom_candidates, key=lambda x: x['rotation_rate'])[:10]
        return {'top_rotation': top, 'bottom_rotation': bottom}

    def compute_rupture_risk(self) -> list:
        from stock.models import ProductStock, InventoryMovement
        cutoff = timezone.now() - timedelta(days=30)
        sale_agg = {}
        for row in InventoryMovement.objects.filter(
            store_id=self.store_id,
            movement_type='SALE',
            created_at__gte=cutoff,
        ).values('product_id').annotate(sale_qty=Sum('quantity')):
            sale_agg[row['product_id']] = abs(row['sale_qty'] or 0)
        stocks = ProductStock.objects.filter(
            store_id=self.store_id,
            quantity__gt=0,
        ).select_related('product__category')
        result = []
        for ps in stocks:
            pid = ps.product_id
            sale_qty_30d = sale_agg.get(pid, 0)
            avg_daily = sale_qty_30d / 30.0
            if avg_daily <= 0:
                continue
            days_to_rupture = ps.quantity / avg_daily
            if days_to_rupture > 60:
                continue
            if days_to_rupture <= 7:
                urgency = 'CRITICAL'
            elif days_to_rupture <= 14:
                urgency = 'WARNING'
            else:
                urgency = 'LOW'
            cat_name = ps.product.category.name if ps.product.category_id else None
            result.append({
                'product_id': str(pid),
                'product_name': ps.product.name,
                'sku': ps.product.sku,
                'category': cat_name,
                'current_qty': ps.quantity,
                'avg_daily_sales': round(avg_daily, 2),
                'days_to_rupture': round(days_to_rupture, 1),
                'urgency': urgency,
            })
        result.sort(key=lambda x: x['days_to_rupture'])
        return result[:20]

    def compute_suspicious_adjustments(self, period: str) -> list:
        from stock.models import InventoryMovement
        start, end = self._period_bounds(period)
        movements = InventoryMovement.objects.filter(
            store_id=self.store_id,
            movement_type__in=['ADJUST', 'DAMAGE'],
            created_at__gte=start,
            created_at__lt=end,
        ).select_related('product', 'actor').order_by('-created_at')
        result = []
        for m in movements:
            if abs(m.quantity) < 5:
                continue
            actor_name = None
            if m.actor_id:
                actor_name = m.actor.get_full_name() or m.actor.email
            result.append({
                'movement_id': str(m.id),
                'product_id': str(m.product_id),
                'product_name': m.product.name,
                'quantity': m.quantity,
                'type': m.movement_type,
                'reason': m.reason,
                'actor_name': actor_name,
                'created_at': m.created_at.isoformat(),
            })
        return result[:20]

    def compute_health_score(self, kpis: dict) -> dict:
        total_sku = max(kpis['total_sku_count'], 1)
        low_stock_count = kpis['low_stock_count']
        out_of_stock_count = kpis['out_of_stock_count']
        dead_stock_count = kpis['dead_stock_count']
        products_with_stock = max(kpis['total_products'], 1)
        good_stock_count = max(0, total_sku - low_stock_count - out_of_stock_count)
        coverage = 30.0 * good_stock_count / total_sku
        alive_count = max(0, products_with_stock - dead_stock_count)
        freshness = 30.0 * alive_count / products_with_stock
        availability = 25.0 * (1 - out_of_stock_count / total_sku)
        reliability = 15.0
        total = round(coverage + freshness + availability + reliability, 1)
        total = min(100.0, max(0.0, total))
        if total >= 80:
            segment = 'SANTE'
        elif total >= 60:
            segment = 'CORRECT'
        elif total >= 40:
            segment = 'FRAGILE'
        else:
            segment = 'CRITIQUE'
        components = [
            ('coverage', coverage, 30.0, 'Réapprovisionner les produits sous le seuil minimum'),
            ('freshness', freshness, 30.0, 'Liquider ou réallouer le stock dormant (>90 jours sans vente)'),
            ('availability', availability, 25.0, 'Commander les produits en rupture de stock'),
            ('reliability', reliability, 15.0, "Investiguer les ajustements d'inventaire importants"),
        ]
        components.sort(key=lambda c: c[1] / c[2])
        actions = [c[3] for c in components[:3]]
        return {
            'total': total,
            'segment': segment,
            'coverage': round(coverage, 1),
            'freshness': round(freshness, 1),
            'availability': round(availability, 1),
            'reliability': round(reliability, 1),
            'actions': actions,
        }
