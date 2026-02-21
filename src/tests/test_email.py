"""Tests for the branded email utility."""
import pytest
from django.core import mail

from core.email import send_branded_email


class TestSendBrandedEmail:
    def test_sends_email(self, db):
        result = send_branded_email(
            subject="Test Email",
            template_name="emails/password_reset",
            context={"greeting": "Bonjour", "reset_url": "https://example.com/reset"},
            recipient_list=["user@test.com"],
        )
        assert result == 1
        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.subject == "Test Email"
        assert msg.to == ["user@test.com"]
        # HTML alternative should be attached
        assert len(msg.alternatives) == 1
        html_content = msg.alternatives[0][0]
        assert "SimaStock" in html_content or "Reinitialiser" in html_content

    def test_plain_text_fallback(self, db):
        send_branded_email(
            subject="Fallback test",
            template_name="emails/verify_email",
            context={"user": type("U", (), {"first_name": "Jean"})(), "verification_url": "https://example.com/verify"},
            recipient_list=["test@test.com"],
        )
        msg = mail.outbox[0]
        assert "Jean" in msg.body or "verify" in msg.body.lower()
