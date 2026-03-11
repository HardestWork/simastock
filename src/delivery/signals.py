"""Auto-sync DeliveryAgent when a User gets (or loses) the DELIVERY role."""
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from stores.models import StoreUser


@receiver(post_save, sender=StoreUser)
def sync_delivery_agent_on_store_link(sender, instance, created, **kwargs):
    """When a DELIVERY user is linked to a new store, create a DeliveryAgent."""
    if not created:
        return
    user = instance.user
    if getattr(user, "role", None) != "DELIVERY":
        return
    from delivery.models import DeliveryAgent

    DeliveryAgent.objects.get_or_create(
        user=user,
        store_id=instance.store_id,
        defaults={
            "name": f"{user.first_name} {user.last_name}".strip() or user.email,
            "phone": getattr(user, "phone", "") or "",
            "is_active": True,
        },
    )


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def sync_delivery_agent_on_user_save(sender, instance, created, **kwargs):
    """When a user is saved with role=DELIVERY, ensure a DeliveryAgent exists
    for each of their stores.  When the role changes away from DELIVERY,
    deactivate the linked agent(s)."""
    from delivery.models import DeliveryAgent
    from stores.models import StoreUser

    is_delivery = getattr(instance, "role", None) == "DELIVERY"

    if is_delivery:
        # Create or re-activate a DeliveryAgent for each store the user belongs to
        store_ids = list(
            StoreUser.objects.filter(user=instance, store__is_active=True)
            .values_list("store_id", flat=True)
        )
        for store_id in store_ids:
            agent, was_created = DeliveryAgent.objects.get_or_create(
                user=instance,
                store_id=store_id,
                defaults={
                    "name": f"{instance.first_name} {instance.last_name}".strip() or instance.email,
                    "phone": getattr(instance, "phone", "") or "",
                    "is_active": True,
                },
            )
            if not was_created:
                # Re-activate and sync name/phone if changed
                changed = []
                new_name = f"{instance.first_name} {instance.last_name}".strip() or instance.email
                if agent.name != new_name:
                    agent.name = new_name
                    changed.append("name")
                new_phone = getattr(instance, "phone", "") or ""
                if agent.phone != new_phone:
                    agent.phone = new_phone
                    changed.append("phone")
                if not agent.is_active:
                    agent.is_active = True
                    changed.append("is_active")
                if changed:
                    agent.save(update_fields=changed)
    else:
        # Deactivate any DeliveryAgent linked to this user
        DeliveryAgent.objects.filter(user=instance, is_active=True).update(is_active=False)
