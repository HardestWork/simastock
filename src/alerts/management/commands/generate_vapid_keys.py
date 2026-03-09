"""Management command to generate VAPID key pair for Web Push."""
import base64

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a VAPID key pair for Web Push notifications."

    def handle(self, *args, **options):
        try:
            from py_vapid import Vapid
        except ImportError:
            self.stderr.write(
                self.style.ERROR("py-vapid is not installed. Run: pip install py-vapid")
            )
            return

        vapid = Vapid()
        vapid.generate_keys()

        raw_private = vapid.private_key.private_numbers().private_value
        private_bytes = raw_private.to_bytes(32, byteorder="big")
        private_b64 = base64.urlsafe_b64encode(private_bytes).decode().rstrip("=")

        raw_public = vapid.public_key.public_bytes(
            encoding=__import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]).Encoding.X962,
            format=__import__("cryptography.hazmat.primitives.serialization", fromlist=["PublicFormat"]).PublicFormat.UncompressedPoint,
        )
        public_b64 = base64.urlsafe_b64encode(raw_public).decode().rstrip("=")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("VAPID keys generated successfully!"))
        self.stdout.write("")
        self.stdout.write("Add these to your .env file:")
        self.stdout.write("")
        self.stdout.write(f"WEBPUSH_VAPID_PRIVATE_KEY={private_b64}")
        self.stdout.write(f"WEBPUSH_VAPID_PUBLIC_KEY={public_b64}")
        self.stdout.write("")
