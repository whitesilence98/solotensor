"""SoloTensor Mailer Service.

Renders Obsidian & Acid Lime brutalist email templates conforming to DESIGN.md
and delivers emails via Resend HTTP API, standard SMTP, or Developer Console Fallback.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import smtplib
from typing import Optional

import httpx

from ..config import Settings, get_settings

logger = logging.getLogger("solotensor.mailer")


def render_obsidian_template(
    title: str,
    preheader: str,
    headline: str,
    body_paragraphs: list[str],
    action_label: Optional[str] = None,
    action_url: Optional[str] = None,
    otp_code: Optional[str] = None,
    subtext: Optional[str] = None,
) -> str:
    """Generate responsive bulletproof Obsidian & Acid Lime HTML email."""
    paragraphs_html = "".join(
        f'<p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #a0a59e;">{p}</p>'
        for p in body_paragraphs
    )

    action_block = ""
    if action_label and action_url:
        action_block = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 24px 0;">
          <tr>
            <td align="center" bgcolor="#d5f06f" style="border-radius: 8px;">
              <a href="{action_url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #171b08; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">
                {action_label} &rarr;
              </a>
            </td>
          </tr>
        </table>
        """

    otp_block = ""
    if otp_code:
        otp_block = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0; background-color: #0e100e; border: 1px solid #282c28; border-radius: 8px;">
          <tr>
            <td align="center" style="padding: 20px 24px;">
              <div style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; color: #8a8e87; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">
                SECURITY CODE
              </div>
              <div style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #d5f06f; line-height: 1;">
                {otp_code}
              </div>
            </td>
          </tr>
        </table>
        """

    subtext_block = ""
    if subtext:
        subtext_block = f"""
        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #282c28; font-size: 12px; line-height: 1.5; color: #686e66;">
          {subtext}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a {{ font-family: Arial, Helvetica, sans-serif !important; }}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0b0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <!-- Preheader -->
  <div style="display: none; max-height: 0px; overflow: hidden;">
    {preheader}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0a0b0a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px;">
          
          <!-- Header / Logo -->
          <tr>
            <td style="padding: 0 0 24px 0; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #ededed;">
                      SOLOTENSOR
                    </span>
                    <span style="color: #d5f06f; font-size: 20px; font-weight: 800;">.</span>
                  </td>
                  <td align="right">
                    <span style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; color: #8a8e87; letter-spacing: 2px; text-transform: uppercase;">
                      STUDIO AUTH
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Obsidian Card -->
          <tr>
            <td style="background-color: #121412; border: 1px solid #282c28; border-radius: 12px; padding: 36px 32px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);">
              <h1 style="margin: 0 0 18px 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                {headline}
              </h1>

              {paragraphs_html}

              {action_block}

              {otp_block}

              {subtext_block}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0 0; text-align: center;">
              <p style="margin: 0; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 11px; color: #50554e; letter-spacing: 1.5px; text-transform: uppercase;">
                SOLOTENSOR &bull; LOCAL-FIRST AI CREATION ENGINE
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


class MailerService:
    """Delivers transactional emails with Obsidian branding."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    async def send_verification_email(
        self,
        email: str,
        username: str,
        token: str,
        otp_code: str,
    ) -> bool:
        """Send account email verification link and 6-digit OTP code."""
        verification_url = f"{self.settings.FRONTEND_URL}/verify-email?token={token}"
        subject = "Verify your SoloTensor Creator account"
        headline = f"Welcome to SoloTensor, {username}"
        preheader = f"Your verification code is {otp_code}. Click to verify your email."
        body = [
            "Your local-first AI studio account has been initialized with 100 daily energy credits.",
            "Verify your email address to unlock cloud backup, model publishing, and creator rewards.",
        ]
        subtext = (
            f"This link and code expire in 24 hours.<br>"
            f"Direct link: <a href=\"{verification_url}\" style=\"color: #8a8e87; text-decoration: underline;\">{verification_url}</a>"
        )

        html = render_obsidian_template(
            title=subject,
            preheader=preheader,
            headline=headline,
            body_paragraphs=body,
            action_label="Verify Email Address",
            action_url=verification_url,
            otp_code=otp_code,
            subtext=subtext,
        )

        plain_text = (
            f"Welcome to SoloTensor, {username}!\n\n"
            f"Your 6-digit verification code: {otp_code}\n\n"
            f"Or verify directly via this link:\n{verification_url}\n\n"
            f"This code expires in 24 hours.\n"
        )

        return await self._dispatch_email(
            to_email=email,
            subject=subject,
            html_content=html,
            text_content=plain_text,
            dev_context={"type": "EMAIL_VERIFICATION", "token": token, "otp_code": otp_code, "url": verification_url},
        )

    async def send_password_reset_email(
        self,
        email: str,
        username: str,
        token: str,
        otp_code: str,
    ) -> bool:
        """Send password reset link and 6-digit OTP code."""
        reset_url = f"{self.settings.FRONTEND_URL}/reset-password?token={token}"
        subject = "Reset your SoloTensor account password"
        headline = "Reset your password"
        preheader = f"Your password reset code is {otp_code}."
        body = [
            f"We received a request to reset the password for your SoloTensor creator account ({username}).",
            "Use the button below or enter the 6-digit security code to set a new password.",
        ]
        subtext = (
            f"If you did not request a password reset, you can safely ignore this message.<br>"
            f"Direct link: <a href=\"{reset_url}\" style=\"color: #8a8e87; text-decoration: underline;\">{reset_url}</a>"
        )

        html = render_obsidian_template(
            title=subject,
            preheader=preheader,
            headline=headline,
            body_paragraphs=body,
            action_label="Reset Password",
            action_url=reset_url,
            otp_code=otp_code,
            subtext=subtext,
        )

        plain_text = (
            f"Password Reset for {username}\n\n"
            f"Your 6-digit security code: {otp_code}\n\n"
            f"Or reset directly via this link:\n{reset_url}\n\n"
            f"This code expires in 24 hours.\n"
        )

        return await self._dispatch_email(
            to_email=email,
            subject=subject,
            html_content=html,
            text_content=plain_text,
            dev_context={"type": "PASSWORD_RESET", "token": token, "otp_code": otp_code, "url": reset_url},
        )

    async def _dispatch_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str,
        dev_context: Optional[dict] = None,
    ) -> bool:
        """Route to Resend API, SMTP, or Developer Console Fallback."""
        # 1. Resend API
        if self.settings.RESEND_API_KEY:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://api.resend.com/emails",
                        headers={
                            "Authorization": f"Bearer {self.settings.RESEND_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "from": self.settings.EMAIL_FROM,
                            "to": [to_email],
                            "subject": subject,
                            "html": html_content,
                            "text": text_content,
                        },
                    )
                    if resp.status_code in (200, 201):
                        logger.info("Email delivered via Resend to %s (%s)", to_email, subject)
                        return True
                    logger.error("Resend delivery failed (%d): %s", resp.status_code, resp.text)
            except Exception as exc:
                logger.error("Resend exception: %s", exc)

        # 2. Standard SMTP
        if self.settings.SMTP_HOST:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = self.settings.EMAIL_FROM
                msg["To"] = to_email
                msg.attach(MIMEText(text_content, "plain", "utf-8"))
                msg.attach(MIMEText(html_content, "html", "utf-8"))

                with smtplib.SMTP(self.settings.SMTP_HOST, self.settings.SMTP_PORT, timeout=10) as server:
                    server.ehlo()
                    try:
                        server.starttls()
                        server.ehlo()
                    except Exception:
                        pass
                    if self.settings.SMTP_USER and self.settings.SMTP_PASSWORD:
                        server.login(self.settings.SMTP_USER, self.settings.SMTP_PASSWORD)
                    server.sendmail(self.settings.EMAIL_FROM, [to_email], msg.as_string())
                logger.info("Email delivered via SMTP to %s", to_email)
                return True
            except Exception as exc:
                logger.error("SMTP delivery failed: %s", exc)

        # 3. Developer Console Fallback (Seamless local-first studio development)
        info = dev_context or {}
        logger.info(
            "\n"
            "======================= [SOLOTENSOR MAILER (DEV CONSOLE)] =======================\n"
            "To: %s\n"
            "Subject: %s\n"
            "Type: %s\n"
            "OTP Code: %s\n"
            "Action URL: %s\n"
            "=================================================================================\n",
            to_email,
            subject,
            info.get("type", "GENERAL"),
            info.get("otp_code", "N/A"),
            info.get("url", "N/A"),
        )
        return True


_default_mailer: Optional[MailerService] = None


def get_mailer_service() -> MailerService:
    """Singleton getter for MailerService (parameterless for FastAPI Depends)."""
    global _default_mailer
    if _default_mailer is None:
        _default_mailer = MailerService()
    return _default_mailer


def set_mailer_service(mailer: Optional[MailerService]) -> None:
    global _default_mailer
    _default_mailer = mailer
