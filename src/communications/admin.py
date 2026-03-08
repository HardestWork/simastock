from django.contrib import admin

from communications.models import Campaign, MessageLog, MessageTemplate

admin.site.register(MessageTemplate)
admin.site.register(MessageLog)
admin.site.register(Campaign)
