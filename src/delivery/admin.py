from django.contrib import admin

from delivery.models import Delivery, DeliveryAgent, DeliveryStatusHistory, DeliveryZone

admin.site.register(DeliveryZone)
admin.site.register(DeliveryAgent)
admin.site.register(Delivery)
admin.site.register(DeliveryStatusHistory)
