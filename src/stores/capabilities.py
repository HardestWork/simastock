"""Capability constants for the advanced permissions system.

When the ``advanced_permissions`` feature flag is enabled on an enterprise,
each StoreUser can be assigned a list of fine-grained capabilities instead
of relying solely on the user's global role.
"""

CAPABILITY_CHOICES = [
    ("CAN_SELL", "Peut vendre (POS, devis)"),
    ("CAN_CASH", "Peut encaisser (caisse, paiements)"),
    ("CAN_STOCK", "Peut gerer le stock"),
    ("CAN_REFUND", "Peut traiter les remboursements"),
    ("CAN_OVERRIDE_PRICE", "Peut modifier les prix"),
    ("CAN_APPROVE", "Peut approuver (transferts, commandes)"),
    ("CAN_VIEW_REPORTS", "Peut consulter les rapports"),
]

ALL_CAPABILITIES = [code for code, _ in CAPABILITY_CHOICES]

# Role -> default capabilities (fallback when capabilities=[] or flag disabled)
ROLE_CAPABILITY_MAP = {
    "ADMIN": list(ALL_CAPABILITIES),
    "MANAGER": list(ALL_CAPABILITIES),
    "SALES": ["CAN_SELL"],
    "CASHIER": ["CAN_CASH"],
    "STOCKER": ["CAN_STOCK"],
}

# Quick-assign presets for the management UI
CAPABILITY_PRESETS = {
    "vendeur": {"label": "Vendeur", "capabilities": ["CAN_SELL"]},
    "caissier": {"label": "Caissier", "capabilities": ["CAN_CASH"]},
    "vendeur_caissier": {
        "label": "Vendeur-Caissier",
        "capabilities": ["CAN_SELL", "CAN_CASH"],
    },
    "gestionnaire": {"label": "Gestionnaire", "capabilities": list(ALL_CAPABILITIES)},
    "magasinier": {"label": "Magasinier", "capabilities": ["CAN_STOCK"]},
}
