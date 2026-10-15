"""Migration tool: transfer all records from SQLite (solotensor.db) to PostgreSQL."""

import argparse
import logging
import sqlite3
import sys
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate_to_postgres")

TABLES_IN_ORDER = [
    "users",
    "user_credits",
    "api_keys",
    "auth_tokens",
    "user_followers",
    "models",
    "model_versions",
    "model_samples",
    "model_files",
    "generations",
    "generation_loras",
]


def migrate(sqlite_path: Path, postgres_url: str) -> None:
    if not sqlite_path.is_file():
        logger.error("SQLite database file not found: %s", sqlite_path)
        sys.exit(1)

    logger.info("Opening SQLite database: %s", sqlite_path)
    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row

    logger.info("Connecting to PostgreSQL...")
    try:
        pg_conn = psycopg.connect(postgres_url, row_factory=dict_row, autocommit=True)
    except Exception as exc:
        logger.error("Failed to connect to PostgreSQL: %s", exc)
        sys.exit(1)

    # Initialize Postgres tables by importing Database from app.db
    backend_root = Path(__file__).parent.parent.resolve()
    sys.path.insert(0, str(backend_root))
    from app.config import Settings
    from app.db import Database

    custom_settings = Settings(DATABASE_URL=postgres_url)
    db = Database(settings=custom_settings)
    logger.info("Initializing schema in target PostgreSQL...")
    db.init_db()

    total_migrated = 0
    with pg_conn.cursor() as pg_cursor:
        for table in TABLES_IN_ORDER:
            # Check if table exists in SQLite
            check_cursor = sqlite_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table,)
            )
            if not check_cursor.fetchone():
                logger.info("Table '%s' does not exist in SQLite, skipping.", table)
                continue

            rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
            if not rows:
                logger.info("Table '%s': 0 rows to migrate.", table)
                continue

            columns = [col[1] for col in sqlite_conn.execute(f"PRAGMA table_info({table})").fetchall()]
            col_list_str = ", ".join(columns)
            placeholders = ", ".join(["%s"] * len(columns))

            # Use ON CONFLICT DO NOTHING so re-running is safe
            insert_sql = f"INSERT INTO {table} ({col_list_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;"

            all_values = [tuple(r[col] for col in columns) for r in rows]
            pg_cursor.executemany(insert_sql, all_values)
            count = len(all_values)

            total_migrated += count
            logger.info("Table '%s': successfully migrated %d rows.", table, count)

    logger.info("Migration complete! Transferred %d records across %d tables.", total_migrated, len(TABLES_IN_ORDER))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SoloTensor data from SQLite to PostgreSQL")
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=Path(__file__).parent.parent / "solotensor.db",
        help="Path to SQLite solotensor.db file",
    )
    parser.add_argument(
        "--postgres",
        type=str,
        required=True,
        help="PostgreSQL connection URL (e.g., postgresql://user:pass@host:5432/dbname)",
    )
    args = parser.parse_args()
    migrate(args.sqlite, args.postgres)
