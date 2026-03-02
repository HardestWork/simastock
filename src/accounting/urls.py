from django.urls import path
from . import views

app_name = "accounting"

urlpatterns = [
    path(
        "balance/",
        views.general_balance_report,
        name="general_balance_report",
    ),
]
