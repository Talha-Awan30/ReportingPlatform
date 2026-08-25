"""Outgoing mail.

With MAIL_ENABLED=false (the default in development) messages are logged rather
than sent, so the alert pipeline can be exercised without an SMTP server.
"""
import logging
import smtplib
from email.message import EmailMessage

from flask import current_app

log = logging.getLogger(__name__)


def send_mail(to, subject, html_body, text_body=None, cc=None):
    """Send one message. Returns (ok, error_message)."""
    recipients = [addr for addr in (to if isinstance(to, (list, tuple)) else [to]) if addr]
    cc = [addr for addr in (cc or []) if addr]
    if not recipients:
        return False, "No recipients"

    if not current_app.config["MAIL_ENABLED"]:
        log.info(
            "[mail disabled] to=%s cc=%s subject=%r",
            ", ".join(recipients),
            ", ".join(cc),
            subject,
        )
        return True, None

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = current_app.config["MAIL_SENDER"]
    message["To"] = ", ".join(recipients)
    if cc:
        message["Cc"] = ", ".join(cc)
    message.set_content(text_body or _strip_html(html_body))
    message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(current_app.config["MAIL_SERVER"], current_app.config["MAIL_PORT"], timeout=30) as smtp:
            if current_app.config["MAIL_USE_TLS"]:
                smtp.starttls()
            if current_app.config["MAIL_USERNAME"]:
                smtp.login(current_app.config["MAIL_USERNAME"], current_app.config["MAIL_PASSWORD"])
            smtp.send_message(message)
        return True, None
    except Exception as exc:  # noqa: BLE001 - the failure is recorded on the alert row
        log.exception("Failed to send mail to %s", recipients)
        return False, str(exc)


def _strip_html(html):
    import re

    text = re.sub(r"<br\s*/?>", "\n", html or "")
    text = re.sub(r"</p>", "\n\n", text)
    return re.sub(r"<[^>]+>", "", text).strip()
