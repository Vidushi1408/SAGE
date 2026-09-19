import logging
import httpx

from app.core.config import settings

logger = logging.getLogger("sage.email")

RESEND_API_URL = "https://api.resend.com/emails"


class EmailService:
    @classmethod
    def send(cls, to: str, subject: str, html: str) -> bool:
        """
        Send a transactional email via Resend.
        Falls back to logging the payload if RESEND_API_KEY is not configured.
        """
        if not settings.RESEND_API_KEY or settings.RESEND_API_KEY.strip() == "":
            logger.info(f"[Mock Email] To: {to} | Subject: {subject}\n{html}")
            return True

        try:
            response = httpx.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to}: {str(e)}")
            return False
