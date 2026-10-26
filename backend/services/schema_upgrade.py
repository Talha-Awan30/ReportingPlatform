"""Bring an existing database up to the current models on start-up.

The app has no migration history - tables are made by `db.create_all()`, which
creates missing tables but never adds a column to one that already exists. This
fills that gap for the columns added since, so a database created by an older
version keeps working without being rebuilt.

Every step is idempotent: on an up-to-date database it does nothing.
"""
import logging

from sqlalchemy import inspect, text

from extensions import db

log = logging.getLogger(__name__)

# table -> [(column, SQL type)] added after the table first shipped.
ADDED_COLUMNS = {
    "clients": [
        ("sbu", "VARCHAR(60)"),
        ("sub_sector", "VARCHAR(120)"),
    ],
    "inspection_sets": [("pdf_path", "VARCHAR(500)")],
}


def ensure_schema():
    # New tables (e.g. pending_clients) are simply created.
    db.create_all()

    inspector = inspect(db.engine)
    tables = set(inspector.get_table_names())
    with db.engine.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, sql_type in columns:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
                    log.info("Added column %s.%s", table, name)
