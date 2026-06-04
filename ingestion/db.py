"""Supabase database operations for ingestion."""

from __future__ import annotations

import logging
import time
from collections import defaultdict
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

    def drop_embedding_index(self) -> None:
        """Drop HNSW index so bulk inserts stay under statement timeout."""
        self.client.rpc("drop_chunks_embedding_index").execute()
        logger.info("Dropped idx_chunks_embedding for bulk ingest")

    def create_embedding_index(self) -> None:
        """Rebuild HNSW index after bulk ingest (may take several minutes)."""
        logger.info("Rebuilding idx_chunks_embedding — this can take 10–30+ minutes...")
        self.client.rpc("create_chunks_embedding_index").execute()
        logger.info("Finished rebuilding idx_chunks_embedding")

    def upsert_chunks(
        self,
        chunks: list[dict[str, Any]],
        *,
        max_retries: int = 4,
        retry_base_seconds: float = 3.0,
    ) -> int:
        if not chunks:
            return 0

        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                result = (
                    self.client.table("chunks")
                    .upsert(chunks, on_conflict="transcript_id,chunk_index")
                    .execute()
                )
                return len(result.data)
            except Exception as e:
                last_error = e
                err = str(e).lower()
                retryable = "timeout" in err or "57014" in err or "500" in err
                if not retryable or attempt == max_retries - 1:
                    raise
                wait = retry_base_seconds * (2**attempt)
                logger.warning(
                    "Chunk upsert failed (attempt %d/%d), retrying in %.0fs: %s",
                    attempt + 1,
                    max_retries,
                    wait,
                    e,
                )
                time.sleep(wait)

        if last_error:
            raise last_error
        return 0

    def get_existing_transcript_keys(self, min_chunks: int = 15) -> set[str]:
        """Fetch ticker:period keys that appear fully ingested (enough chunks).

        Transcripts with a row but failed/partial chunk uploads are not skipped,
        so a resumed run can retry them.
        """
        chunk_counts: dict[str, int] = defaultdict(int)
        offset = 0
        page_size = 1000

        while True:
            result = (
                self.client.table("chunks")
                .select("transcript_id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            if not result.data:
                break
            for row in result.data:
                chunk_counts[row["transcript_id"]] += 1
            if len(result.data) < page_size:
                break
            offset += page_size

        complete_ids = {tid for tid, count in chunk_counts.items() if count >= min_chunks}
        keys: set[str] = set()

        if not complete_ids:
            logger.info("Found 0 fully ingested transcripts (min_chunks=%d)", min_chunks)
            return keys

        id_list = list(complete_ids)
        batch_size = 200
        for batch_start in range(0, len(id_list), batch_size):
            batch_ids = id_list[batch_start : batch_start + batch_size]
            result = (
                self.client.table("transcripts")
                .select("ticker, period_string")
                .in_("id", batch_ids)
                .execute()
            )
            for row in result.data:
                keys.add(f"{row['ticker']}:{row['period_string']}")

        logger.info(
            "Found %d fully ingested transcripts (min_chunks=%d)",
            len(keys),
            min_chunks,
        )
        return keys

    def delete_transcript_and_chunks(self, transcript_id: str) -> None:
        """Remove a failed partial ingest so the transcript can be retried."""
        self.client.table("chunks").delete().eq("transcript_id", transcript_id).execute()
        self.client.table("transcripts").delete().eq("id", transcript_id).execute()
        for cache_key, tid in list(self._transcript_cache.items()):
            if tid == transcript_id:
                del self._transcript_cache[cache_key]

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
