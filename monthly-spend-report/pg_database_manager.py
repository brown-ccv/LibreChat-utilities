"""PostgreSQL connection utilities for budget alerts.

Configuration is read from environment variables:
- DATABASE_URL (preferred), for example:
  postgresql://user:password@host:5432/dbname
- or individual settings:
  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB,
  POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_SSLMODE
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Dict, Generator, Iterable, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


def _connection_params_from_env() -> Dict[str, Any]:
	"""Build psycopg2 connection parameters from environment variables."""
	database_url = os.getenv("PROD_DATABASE_URL")
	if database_url:
		return {"dsn": database_url}

	return {
		"host": os.getenv("POSTGRES_HOST", "localhost"),
		"port": int(os.getenv("POSTGRES_PORT", "5432")),
		"dbname": os.getenv("POSTGRES_DB", "postgres"),
		"user": os.getenv("POSTGRES_USER", "postgres"),
		"password": os.getenv("POSTGRES_PASSWORD", "postgres"),
		"sslmode": os.getenv("POSTGRES_SSLMODE", "prefer"),
	}


@contextmanager
def get_connection() -> Generator[psycopg2.extensions.connection, None, None]:
	"""Yield a PostgreSQL connection and ensure it is closed."""
	params = _connection_params_from_env()
	connection = psycopg2.connect(**params)
	try:
		yield connection
	finally:
		connection.close()


def test_connection() -> bool:
	"""Return True if PostgreSQL is reachable with current configuration."""
	with get_connection() as connection:
		with connection.cursor() as cursor:
			cursor.execute("SELECT 1")
			return cursor.fetchone()[0] == 1


def execute_query(
	query: str,
	params: Optional[Iterable[Any]] = None,
	fetch: bool = False,
) -> Optional[list[Dict[str, Any]]]:
	"""Execute a SQL query.

	When fetch=True, returns rows as a list of dictionaries.
	Otherwise commits the transaction and returns None.
	"""
	with get_connection() as connection:
		with connection.cursor(cursor_factory=RealDictCursor) as cursor:
			cursor.execute(query, params)
			if fetch:
				rows = cursor.fetchall()
				return [dict(row) for row in rows]
			connection.commit()
	return None
