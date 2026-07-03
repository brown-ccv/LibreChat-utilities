import logging
import mysql.connector
from datetime import datetime, timedelta
import pymongo
from collections import defaultdict
import argparse
import sys
import os
from datetime import date
import calendar
from pg_database_manager import get_connection

_log_format = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, f"monthly_spend_report_{date.today()}.log")

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(_log_format)
logger.addHandler(_stream_handler)

_file_handler = logging.FileHandler(_log_file)
_file_handler.setFormatter(_log_format)
logger.addHandler(_file_handler)

_required_env_vars = [
    "MYSQL_HOST",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
    "MYSQL_DATABASE",
    "MYSQL_PORT",
]

_missing = [var for var in _required_env_vars if not os.environ.get(var)]
if _missing:
    logger.error(f"Missing required environment variables: {', '.join(_missing)}")
    sys.exit(1)

mysql_host = os.environ["MYSQL_HOST"]
mysql_user = os.environ["MYSQL_USER"]
mysql_password = os.environ["MYSQL_PASSWORD"]
mysql_db = os.environ["MYSQL_DATABASE"]
mysql_port = os.environ["MYSQL_PORT"]


# Database connections
mysql_config = {
    'host': mysql_host,
    'user': mysql_user,
    'password': mysql_password,
    'database': mysql_db,
    'port': mysql_port
}

logger.debug("MySQL configuration loaded")

def get_mysql_connection():
    return mysql.connector.connect(**mysql_config)


def get_total_spend():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM end_user_total_spend")
            row = cursor.fetchone()

    if not row:
        raise RuntimeError("No rows returned from end_user_total_spend")

    return float(row[0])

def insert_monthly_spend_in_db(month, year, total_spend):
    try:

        ## Inset data in MYSQL
        conn = get_mysql_connection()
        cursor = conn.cursor()

        logger.info(f"Inserting monthly payment in MySQL for {month} {year}")
        cursor.execute("""
            INSERT INTO monthly_spend (month, year, total_spend)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                total_spend = VALUES(total_spend)
            """, (month, year , total_spend))
            
        conn.commit()

    except Exception as e:
        logger.error(f"Error: {e}")
        return 1

    finally:
        cursor.close()
        conn.close()
       
    logger.info(f"Successfully stored in monthly_spend")


def main():
    try:
        current_date = date.today()
        month_number = current_date.month
        month_name = calendar.month_name[month_number]
        logger.info(f"Calculating total spend for {month_name}")
        
        ## Get spend from LiteLLM
        total_spend = get_total_spend()

        insert_monthly_spend_in_db(current_date.month, current_date.year,total_spend)

    except ValueError as e:
        logger.error(f"Error: {e}")
        return 1

    
    return 0

if __name__ == "__main__":
    main() 