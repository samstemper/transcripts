#!/usr/bin/env python3
"""Apply bulk-ingest SQL setup when a direct Postgres URL is available."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

INGESTION_DIR = Path(__file__).parent
load_dotenv(INGESTION_DIR / ".env")
load_dotenv(INGESTION_DIR.parent / ".env")


def main() -> None:
    db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        print(
            "No SUPABASE_DB_URL or DATABASE_URL in .env.\n\n"
            "Option A (easiest): Open Supabase → SQL Editor, paste and run:\n"
            "  ingestion/setup_bulk_ingest.sql\n\n"
            "Option B: Add your Postgres connection string from\n"
            "  Supabase → Project Settings → Database → Connection string (URI)\n"
            "  as SUPABASE_DB_URL=postgresql://... in ingestion/.env\n"
            "  then run this script again."
        )
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2: pip install psycopg2-binary")
        sys.exit(1)

    sql = (INGESTION_DIR / "setup_bulk_ingest.sql").read_text()
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("Applied setup_bulk_ingest.sql successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
