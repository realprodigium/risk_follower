"""
Servicio de notificaciones por email via Gmail SMTP.
Configura en .env: GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_RECIPIENTS
ALERT_RECIPIENTS: lista separada por comas de emails que reciben las alertas.
"""
import os
import logging
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
import smtplib
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
ALERT_RECIPIENTS_RAW = os.getenv("ALERT_RECIPIENTS", "")
ALERT_RECIPIENTS = [e.strip() for e in ALERT_RECIPIENTS_RAW.split(",") if e.strip()]

RISK_COLORS = {
    "peligro":    "#f04040",
    "advertencia": "#ffc107",
}
RISK_LABELS = {
    "peligro":    "⛔ PELIGRO CRÍTICO",
    "advertencia": "⚠️ ADVERTENCIA",
}


def _build_html(incident_id: int, hardware: str, risk_level: str,
                co2: float, temperature: float, humidity: float,
                triggered_at: datetime) -> str:
    color = RISK_COLORS.get(risk_level, "#888")
    label = RISK_LABELS.get(risk_level, risk_level.upper())
    ts = triggered_at.strftime("%Y-%m-%d %H:%M:%S UTC") if triggered_at else "Desconocido"
    base_url = os.getenv("APP_BASE_URL", "https://co2-app-upjw.onrender.com")
    link = f"{base_url}/incidents"

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1d26;border-radius:16px;overflow:hidden;border:1px solid #2a2d3a;">
        <!-- Header -->
        <tr>
          <td style="background:{color}18;border-bottom:2px solid {color};padding:24px 32px;">
            <div style="font-size:11px;color:{color};letter-spacing:2px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">
              Sistema de Monitoreo — Seven Waves
            </div>
            <div style="font-size:22px;color:{color};font-weight:700;">{label}</div>
            <div style="font-size:13px;color:#888;margin-top:4px;">Incidente #{incident_id} · {hardware}</div>
          </td>
        </tr>
        <!-- Metrics -->
        <tr>
          <td style="padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background:#0f1117;border-radius:10px;padding:16px;border:1px solid #2a2d3a;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">CO₂</div>
                  <div style="font-size:28px;font-weight:700;color:{'#f04040' if co2 > 1500 else '#ffc107'};font-family:monospace;">{co2:.0f}</div>
                  <div style="font-size:11px;color:#666;">PPM</div>
                </td>
                <td width="12"></td>
                <td align="center" style="background:#0f1117;border-radius:10px;padding:16px;border:1px solid #2a2d3a;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Temperatura</div>
                  <div style="font-size:28px;font-weight:700;color:#e0e0e0;font-family:monospace;">{temperature:.1f}</div>
                  <div style="font-size:11px;color:#666;">°C</div>
                </td>
                <td width="12"></td>
                <td align="center" style="background:#0f1117;border-radius:10px;padding:16px;border:1px solid #2a2d3a;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Humedad</div>
                  <div style="font-size:28px;font-weight:700;color:#e0e0e0;font-family:monospace;">{humidity:.1f}</div>
                  <div style="font-size:11px;color:#666;">%</div>
                </td>
              </tr>
            </table>
            <div style="margin-top:16px;padding:12px 16px;background:#0f1117;border-radius:8px;border:1px solid #2a2d3a;">
              <span style="font-size:12px;color:#666;">Dispositivo: </span>
              <span style="font-size:12px;color:#aaa;font-family:monospace;">{hardware}</span>
              &nbsp;&nbsp;
              <span style="font-size:12px;color:#666;">Detectado: </span>
              <span style="font-size:12px;color:#aaa;font-family:monospace;">{ts}</span>
            </div>
          </td>
        </tr>
        <!-- Protocol -->
        <tr>
          <td style="padding:0 32px 24px;">
            <div style="background:#0f1117;border-radius:10px;padding:16px 20px;border-left:3px solid {color};">
              <div style="font-size:11px;color:{color};font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Protocolo SG-SST (Decreto 1072)</div>
              <div style="font-size:13px;color:#aaa;line-height:1.8;">
                1. Evacuar el área de fermentación inmediatamente.<br>
                2. Ventilar el espacio abriendo todas las salidas de aire.<br>
                3. Notificar al responsable de SST y brigada de emergencia.<br>
                4. No reingresar hasta que los niveles vuelvan a rango normal.
              </div>
            </div>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 32px;" align="center">
            <a href="{link}" style="display:inline-block;background:{color};color:#fff;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">
              Ver Incidente #{incident_id}
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #2a2d3a;padding:16px 32px;">
            <div style="font-size:11px;color:#444;text-align:center;">
              Este mensaje fue generado automáticamente por el sistema de monitoreo CO₂ de Seven Waves.<br>
              No responder a este correo.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


async def send_incident_alert(
    incident_id: int,
    hardware: str,
    risk_level: str,
    co2: float,
    temperature: float,
    humidity: float,
    triggered_at: datetime,
) -> tuple[bool, str | None]:
    """
    Envía un email de alerta para un incidente.
    Retorna (success: bool, error_message: str | None).
    Nunca lanza excepción — el caller decide qué hacer con el error.
    """
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured. Skipping notification.")
        return False, "Gmail credentials not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)"

    if not ALERT_RECIPIENTS:
        logger.warning("No ALERT_RECIPIENTS configured. Skipping notification.")
        return False, "No recipients configured (ALERT_RECIPIENTS missing)"

    label = RISK_LABELS.get(risk_level, risk_level.upper())
    subject = f"{label} — {hardware} | Incidente #{incident_id}"
    html_body = _build_html(incident_id, hardware, risk_level, co2, temperature, humidity, triggered_at)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Seven Waves Monitor <{GMAIL_USER}>"
        msg["To"] = ", ".join(ALERT_RECIPIENTS)
        msg.attach(MIMEText(html_body, "html"))

        # Run blocking smtplib in executor so we don't block the event loop
        def _send():
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                server.sendmail(GMAIL_USER, ALERT_RECIPIENTS, msg.as_string())

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
        logger.info(f"Notification sent for incident #{incident_id} to {ALERT_RECIPIENTS}")
        return True, None

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to send notification for incident #{incident_id}: {error_msg}")
        return False, error_msg


notification_service = type("NotificationService", (), {
    "send_incident_alert": staticmethod(send_incident_alert)
})()
