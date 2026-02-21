"""API tests for purchase order and goods receipt workflow."""

from decimal import Decimal

from catalog.models import Product
from purchases.models import PurchaseOrder, Supplier
from stock.models import ProductStock


def _make_product(enterprise, *, name: str, sku: str, cost: str = "1000.00", sell: str = "1500.00"):
    return Product.objects.create(
        enterprise=enterprise,
        name=name,
        slug=sku.lower(),
        sku=sku,
        cost_price=Decimal(cost),
        selling_price=Decimal(sell),
        is_active=True,
    )


def test_create_purchase_order_with_lines(manager_client, store):
    supplier = Supplier.objects.create(enterprise=store.enterprise, name="Fournisseur Test")
    p1 = _make_product(store.enterprise, name="Routeur", sku="RTR-001", cost="12000.00")
    p2 = _make_product(store.enterprise, name="Switch", sku="SWT-001", cost="18000.00")

    resp = manager_client.post(
        "/api/v1/purchase-orders/",
        {
            "store": str(store.id),
            "supplier": str(supplier.id),
            "notes": "Commande de test",
            "submit_now": True,
            "lines": [
                {"product_id": str(p1.id), "quantity_ordered": 2, "unit_cost": "12000.00"},
                {"product_id": str(p2.id), "quantity_ordered": 1, "unit_cost": "18000.00"},
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == PurchaseOrder.Status.SUBMITTED
    assert Decimal(resp.data["subtotal"]) == Decimal("42000.00")
    assert len(resp.data["lines"]) == 2


def test_update_purchase_order_lines_requires_draft(manager_client, store):
    supplier = Supplier.objects.create(enterprise=store.enterprise, name="Fournisseur Draft")
    p1 = _make_product(store.enterprise, name="Cordon", sku="CRD-001", cost="2000.00")
    p2 = _make_product(store.enterprise, name="Prise", sku="PRS-001", cost="5000.00")

    create_resp = manager_client.post(
        "/api/v1/purchase-orders/",
        {
            "store": str(store.id),
            "supplier": str(supplier.id),
            "submit_now": False,
            "lines": [{"product_id": str(p1.id), "quantity_ordered": 2, "unit_cost": "2000.00"}],
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    po_id = create_resp.data["id"]

    patch_resp = manager_client.patch(
        f"/api/v1/purchase-orders/{po_id}/",
        {
            "lines": [
                {"product_id": str(p2.id), "quantity_ordered": 3, "unit_cost": "5000.00"},
            ]
        },
        format="json",
    )
    assert patch_resp.status_code == 200, patch_resp.data
    assert Decimal(patch_resp.data["subtotal"]) == Decimal("15000.00")
    assert len(patch_resp.data["lines"]) == 1
    assert patch_resp.data["lines"][0]["product"] == str(p2.id)


def test_receive_goods_updates_stock_and_purchase_status(manager_client, store):
    supplier = Supplier.objects.create(enterprise=store.enterprise, name="Fournisseur Reception")
    product = _make_product(store.enterprise, name="Point d'acces", sku="AP-001", cost="25000.00")

    po_resp = manager_client.post(
        "/api/v1/purchase-orders/",
        {
            "store": str(store.id),
            "supplier": str(supplier.id),
            "submit_now": True,
            "lines": [{"product_id": str(product.id), "quantity_ordered": 4, "unit_cost": "25000.00"}],
        },
        format="json",
    )
    assert po_resp.status_code == 201, po_resp.data
    line_id = po_resp.data["lines"][0]["id"]
    po_id = po_resp.data["id"]

    receipt_resp = manager_client.post(
        "/api/v1/goods-receipts/",
        {
            "store": str(store.id),
            "purchase_order": po_id,
            "notes": "Reception totale",
            "lines": [{"purchase_order_line_id": line_id, "quantity_received": 4}],
        },
        format="json",
    )
    assert receipt_resp.status_code == 201, receipt_resp.data

    po = PurchaseOrder.objects.get(pk=po_id)
    assert po.status == PurchaseOrder.Status.RECEIVED

    stock = ProductStock.objects.get(store=store, product=product)
    assert stock.quantity == 4
