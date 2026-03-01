"""Capability constants for the advanced permissions system.

When the ``advanced_permissions`` feature flag is enabled on an enterprise,
each StoreUser can be assigned a list of fine-grained capabilities instead
of relying solely on the user's global role.
"""

CAPABILITY_CHOICES = [
    ("CAN_MANAGE_USERS", "Peut gerer les utilisateurs"),
    ("CAN_MANAGE_STORES", "Peut gerer les boutiques"),
    ("CAN_MANAGE_SUBSCRIPTIONS", "Peut gerer les abonnements entreprise"),
    ("CAN_MANAGE_MODULES", "Peut gerer les modules payants"),
    ("CAN_SELL", "Peut vendre (POS, devis)"),
    ("CAN_CASH", "Peut encaisser (caisse, paiements)"),
    ("CAN_STOCK", "Peut gerer le stock"),
    ("CAN_REFUND", "Peut traiter les remboursements"),
    ("CAN_OVERRIDE_PRICE", "Peut modifier les prix"),
    ("CAN_APPROVE", "Peut approuver (transferts, commandes)"),
    ("CAN_VIEW_REPORTS", "Peut consulter les rapports"),
    ("CAN_CREATE_EXPENSE", "Peut creer une depense"),
    ("CAN_EDIT_EXPENSE", "Peut modifier une depense"),
    ("CAN_VOID_EXPENSE", "Peut annuler une depense"),
    ("CAN_VIEW_EXPENSE_REPORTS", "Peut consulter les rapports depenses"),
    ("CAN_MANAGE_CATEGORIES", "Peut gerer les categories de depenses"),
    ("CAN_MANAGE_WALLETS", "Peut gerer les wallets"),
    ("CAN_SET_BUDGETS", "Peut configurer les budgets depenses"),
    ("CAN_MANAGE_LEADS", "Peut gerer les prospects commerciaux"),
    ("CAN_MANAGE_OPPORTUNITIES", "Peut gerer les opportunites commerciales"),
    ("CAN_LOG_ACTIVITY", "Peut enregistrer les activites commerciales"),
    ("CAN_VIEW_COMMERCIAL_TEAM", "Peut voir les donnees commerciales equipe"),
    ("CAN_APPROVE_COMMERCIAL_BONUS", "Peut approuver les primes commerciales"),
    ("CAN_EXPORT_COMMERCIAL", "Peut exporter les donnees commerciales"),
    ("CAN_VIEW_HRM", "Peut consulter les donnees RH"),
    ("CAN_MANAGE_HRM", "Peut gerer les donnees RH"),
]

ALL_CAPABILITIES = [code for code, _ in CAPABILITY_CHOICES]

# Role -> default capabilities (fallback when capabilities=[] or flag disabled)
ROLE_CAPABILITY_MAP = {
    "ADMIN": list(ALL_CAPABILITIES),
    "MANAGER": list(ALL_CAPABILITIES),
    "HR": ["CAN_VIEW_HRM", "CAN_MANAGE_HRM", "CAN_VIEW_REPORTS"],
    "COMMERCIAL": [
        "CAN_MANAGE_LEADS",
        "CAN_MANAGE_OPPORTUNITIES",
        "CAN_LOG_ACTIVITY",
        "CAN_VIEW_COMMERCIAL_TEAM",
        "CAN_EXPORT_COMMERCIAL",
    ],
    "SALES": ["CAN_SELL", "CAN_MANAGE_LEADS", "CAN_MANAGE_OPPORTUNITIES", "CAN_LOG_ACTIVITY"],
    "CASHIER": ["CAN_CASH", "CAN_CREATE_EXPENSE", "CAN_VIEW_EXPENSE_REPORTS"],
    "STOCKER": ["CAN_STOCK"],
}

# Quick-assign presets for the management UI
CAPABILITY_PRESETS = {
    "vendeur": {"label": "Vendeur", "capabilities": ["CAN_SELL"]},
    "commercial": {
        "label": "Commercial",
        "capabilities": ["CAN_MANAGE_LEADS", "CAN_MANAGE_OPPORTUNITIES", "CAN_LOG_ACTIVITY"],
    },
    "rh": {
        "label": "Ressources Humaines",
        "capabilities": ["CAN_VIEW_HRM", "CAN_MANAGE_HRM"],
    },
    "caissier": {
        "label": "Caissier",
        "capabilities": ["CAN_CASH", "CAN_CREATE_EXPENSE", "CAN_VIEW_EXPENSE_REPORTS"],
    },
    "vendeur_caissier": {
        "label": "Vendeur-Caissier",
        "capabilities": [
            "CAN_SELL",
            "CAN_CASH",
            "CAN_CREATE_EXPENSE",
            "CAN_VIEW_EXPENSE_REPORTS",
        ],
    },
    "gestionnaire": {"label": "Gestionnaire", "capabilities": list(ALL_CAPABILITIES)},
    "magasinier": {"label": "Magasinier", "capabilities": ["CAN_STOCK"]},
}
