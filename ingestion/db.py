"""Supabase database operations for ingestion."""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client, create_client

logger = logging.getLogger(__name__)


class SupabaseIngester:
    def __init__(self, url: str, service_key: str):
        self.client: Client = create_client(url, service_key)
        self._company_cache: dict[str, str] = {}
        self._transcript_cache: dict[str, str] = {}

    def upsert_company(self, row: dict[str, Any]) -> str:
        ticker = row["ticker"]
        if ticker in self._company_cache:
            return self._company_cache[ticker]

        payload = {
            "ticker": ticker,
            "company_name": row["company_name"],
            "sector": row.get("sector"),
            "industry": row.get("industry"),
            "cik": row.get("cik"),
            "headquarters": row.get("headquarters"),
        }

        result = (
            self.client.table("companies")
            .upsert(payload, on_conflict="ticker")
            .execute()
        )
        company_id = result.data[0]["id"]
        self._company_cache[ticker] = company_id
        return company_id

    def upsert_transcript(self, row: dict[str, Any], company_id: str) -> str:
        cache_key = f"{row['ticker']}:{row['period_string']}"
        if cache_key in self._transcript_cache:
            return self._transcript_cache[cache_key]

        payload = {
            "company_id": company_id,
            "ticker": row["ticker"],
            "company_name": row["company_name"],
            "fiscal_year": row["fiscal_year"],
            "fiscal_quarter": row["fiscal_quarter"],
            "period_string": row["period_string"],
            "call_date": row.get("call_date"),
            "source_dataset": row.get("source_dataset"),
            "source_url": row.get("source_url"),
            "metadata": row.get("metadata", {}),
        }

        result = (
            self.client.table("transcripts")
            .upsert(payload, on_conflict="ticker,period_string")
            .execute()
        )
        transcript_id = result.data[0]["id"]
        self._transcript_cache[cache_key] = transcript_id
        return transcript_id

    def upsert_chunks(self, chunks: list[dict[str, Any]]) -> int:
        if not chunks:
            return 0

        result = (
            self.client.table("chunks")
            .upsert(chunks, on_conflict="transcript_id,chunk_index")
            .execute()
        )
        return len(result.data)

    def get_existing_transcript_keys(self) -> set[str]:
        """Fetch all ticker:period keys already ingested for resumability."""
        keys: set[str] = set()
        offset = 0
        page_size = 1000

        while True:
            result = (
                self.client.table("transcripts")
                .select("ticker, period_string")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            if not result.data:
                break
            for row in result.data:
                keys.add(f"{row['ticker']}:{row['period_string']}")
            if len(result.data) < page_size:
                break
            offset += page_size

        logger.info("Found %d existing transcripts in database", len(keys))
        return keys

    def update_corpus_metadata(
        self,
        min_period: str,
        max_period: str,
        total_transcripts: int,
        total_chunks: int,
    ) -> None:
        self.client.table("corpus_metadata").upsert(
            {
                "id": 1,
                "min_period": min_period,
                "max_period": max_period,
                "total_transcripts": total_transcripts,
                "total_chunks": total_chunks,
            },
            on_conflict="id",
        ).execute()

    def count_chunks(self) -> int:
        result = self.client.table("chunks").select("id", count="exact").execute()
        return result.count or 0

    def count_transcripts(self) -> int:
        result = self.client.table("transcripts").select("id", count="exact").execute()
        return result.count or 0
