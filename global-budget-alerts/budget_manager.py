from database_manager import get_connection
import os
import logging
import sys
from datetime import date
import smtplib
from email.message import EmailMessage
import requests
import json

_log_format = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"export_metrics_{date.today()}.log")

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(_log_format)
logger.addHandler(_stream_handler)

_file_handler = logging.FileHandler(_log_file)
_file_handler.setFormatter(_log_format)
logger.addHandler(_file_handler)

SOFT_LIMIT = int(os.getenv("BUDGET_SOFT_LIMIT", "7500"))
HARD_LIMIT = int(os.getenv("BUDGET_HARD_LIMIT", "10000"))

SMTP_HOST = os.getenv("SMTP_HOST", "regmail.brown.edu")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_USER = os.getenv("SMTP_USER", "ccv-ai@brown.edu")

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")

TO_EMAIL = ["camilo_diaz@brown.edu",
            "maria_restrepo@brown.edu",
            "paul_stey@brown.edu",
            "yang_xu@brown.edu"]

def send_email(body):
    msg = EmailMessage()
    msg["Subject"] = "IMPORTANT: Librechat Budget Report"
    msg["From"] = SMTP_USER
    msg["To"] = ", ".join(TO_EMAIL)
    msg.set_content(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.send_message(msg)
        logger.info("Email sent successfully.")
    except Exception as exc:
        logger.error("Failed to send email: %s", exc, exc_info=True)

def send_slack_message(message):
    if not SLACK_WEBHOOK_URL:
        logger.warning("SLACK_WEBHOOK_URL not set, skipping Slack notification.")
        return
    try:
        response = requests.post(
            SLACK_WEBHOOK_URL,
            data=json.dumps({"text": message}),
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        logger.info("Slack message sent successfully.")
    except Exception as exc:
        logger.error("Failed to send Slack message: %s", exc, exc_info=True)


def get_total_spend():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM end_user_total_spend")
            row = cursor.fetchone()

    if not row:
        raise RuntimeError("No rows returned from end_user_total_spend")

    return float(row[0])


def main():
    try:
        total_spend = get_total_spend()
        logger.info("Current total spend: $ %.2f", total_spend)

        if total_spend >= HARD_LIMIT:
            message = f"Hard limit reached: {total_spend:.2f}"
            logger.warning("Hard limit reached: $ %.2f", total_spend)
            #send_email(message)
            send_slack_message(message)
        elif total_spend >= SOFT_LIMIT:
            message = f"Soft limit reached: {total_spend:.2f}"
            logger.warning("Soft limit reached: $ %.2f", total_spend)
            #send_email(message)
            send_slack_message(message)
        else:
            logger.info("Budget below thresholds: $ %.2f", total_spend)
    except Exception as exc:
        logger.error("Budget check failed: %s", exc, exc_info=True)
        raise

if __name__ == "__main__":
    main()  