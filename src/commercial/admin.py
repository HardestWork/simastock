"""Admin registrations for commercial module."""
from django.contrib import admin

from commercial.models import (
    CommercialAISignal,
    CommercialActivity,
    CommercialActivityAttachment,
    CommercialFollowUpTask,
    CommercialHealthSnapshot,
    CommercialImportErrorRow,
    CommercialImportJob,
    CommercialIncentivePolicy,
    CommercialIncentiveResult,
    CommercialIncentiveRun,
    CommercialIncentiveTier,
    CommercialLeadSource,
    CommercialObjectiveMonthly,
    CommercialOpportunity,
    CommercialOpportunityStageHistory,
    CommercialProspect,
    CommercialRegion,
    CommercialSector,
    CommercialTag,
    CommercialTeamMembership,
)


@admin.register(CommercialTeamMembership)
class CommercialTeamMembershipAdmin(admin.ModelAdmin):
    list_display = ("store", "manager", "seller", "is_active", "created_at")
    list_filter = ("store", "is_active")
    search_fields = ("manager__email", "seller__email")


@admin.register(CommercialRegion)
class CommercialRegionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "enterprise", "is_active")
    list_filter = ("enterprise", "is_active")
    search_fields = ("name", "code")


@admin.register(CommercialSector)
class CommercialSectorAdmin(admin.ModelAdmin):
    list_display = ("name", "enterprise", "is_active")
    list_filter = ("enterprise", "is_active")
    search_fields = ("name",)


@admin.register(CommercialTag)
class CommercialTagAdmin(admin.ModelAdmin):
    list_display = ("name", "enterprise", "color")
    list_filter = ("enterprise",)
    search_fields = ("name",)


@admin.register(CommercialLeadSource)
class CommercialLeadSourceAdmin(admin.ModelAdmin):
    list_display = ("label", "code", "enterprise", "is_active")
    list_filter = ("enterprise", "is_active", "code")
    search_fields = ("label",)


@admin.register(CommercialProspect)
class CommercialProspectAdmin(admin.ModelAdmin):
    list_display = ("company_name", "store", "owner", "status", "score", "next_follow_up_at")
    list_filter = ("store", "status")
    search_fields = ("company_name", "contact_name", "phone", "email")


@admin.register(CommercialOpportunity)
class CommercialOpportunityAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "owner", "stage", "probability_pct", "estimated_amount")
    list_filter = ("store", "stage", "is_archived")
    search_fields = ("name",)


@admin.register(CommercialOpportunityStageHistory)
class CommercialOpportunityStageHistoryAdmin(admin.ModelAdmin):
    list_display = ("opportunity", "from_stage", "to_stage", "changed_by", "created_at")
    list_filter = ("to_stage",)
    search_fields = ("opportunity__name",)


@admin.register(CommercialActivity)
class CommercialActivityAdmin(admin.ModelAdmin):
    list_display = ("type", "store", "actor", "subject", "started_at", "outcome")
    list_filter = ("store", "type", "outcome")
    search_fields = ("subject", "notes")


@admin.register(CommercialActivityAttachment)
class CommercialActivityAttachmentAdmin(admin.ModelAdmin):
    list_display = ("activity", "file_name", "mime_type", "size", "created_at")
    search_fields = ("file_name",)


@admin.register(CommercialFollowUpTask)
class CommercialFollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "store", "assigned_to", "status", "priority", "due_at")
    list_filter = ("store", "status", "priority")
    search_fields = ("title", "description")


@admin.register(CommercialImportJob)
class CommercialImportJobAdmin(admin.ModelAdmin):
    list_display = ("store", "status", "total_rows", "success_rows", "error_rows", "created_at")
    list_filter = ("store", "status")


@admin.register(CommercialImportErrorRow)
class CommercialImportErrorRowAdmin(admin.ModelAdmin):
    list_display = ("job", "row_number", "created_at")
    search_fields = ("error_message",)


@admin.register(CommercialObjectiveMonthly)
class CommercialObjectiveMonthlyAdmin(admin.ModelAdmin):
    list_display = ("store", "seller", "period", "target_signed_revenue", "target_win_rate", "is_locked")
    list_filter = ("store", "period", "is_locked")


@admin.register(CommercialIncentivePolicy)
class CommercialIncentivePolicyAdmin(admin.ModelAdmin):
    list_display = ("name", "scope", "enterprise", "store", "is_active", "effective_from", "effective_to")
    list_filter = ("scope", "is_active")


@admin.register(CommercialIncentiveTier)
class CommercialIncentiveTierAdmin(admin.ModelAdmin):
    list_display = ("policy", "rank", "name", "min_signed_revenue", "max_signed_revenue")
    list_filter = ("policy",)


@admin.register(CommercialIncentiveRun)
class CommercialIncentiveRunAdmin(admin.ModelAdmin):
    list_display = ("store", "period", "status", "computed_at", "approved_at")
    list_filter = ("store", "period", "status")


@admin.register(CommercialIncentiveResult)
class CommercialIncentiveResultAdmin(admin.ModelAdmin):
    list_display = ("run", "seller", "tier_name", "signed_revenue", "final_bonus")
    list_filter = ("run__store", "run__period")


@admin.register(CommercialHealthSnapshot)
class CommercialHealthSnapshotAdmin(admin.ModelAdmin):
    list_display = ("store", "seller", "period", "score_overall", "risk_level")
    list_filter = ("store", "period", "risk_level")


@admin.register(CommercialAISignal)
class CommercialAISignalAdmin(admin.ModelAdmin):
    list_display = ("store", "signal_type", "severity", "status", "due_by", "created_at")
    list_filter = ("store", "severity", "status")
    search_fields = ("title", "description")
