"""Document verification utilities: tokens, hashes, and QR codes."""
import hashlib
import secrets
import io
import base64

from django.conf import settings


def generate_verification_token() -> str:
    """Generate a 32-char URL-safe random hex token."""
    return secrets.token_hex(16)


def generate_verification_hash(entity_id: str, created_at_iso: str) -> str:
    """Short 8-char hash for printing on documents. Format: SIM-XXXX-XXXX."""
    raw = f"{entity_id}:{created_at_iso}:{settings.SECRET_KEY[:16]}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:8].upper()
    return f"SIM-{digest[:4]}-{digest[4:]}"


def build_verify_url(token: str) -> str:
    """Build public verification URL."""
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/verify/{token}"


def generate_qr_data_uri(url: str) -> str:
    """Generate QR code as base64 data URI for embedding in HTML templates."""
    import qrcode

    qr = qrcode.make(url, box_size=4, border=2)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"
