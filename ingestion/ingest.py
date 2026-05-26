#!/usr/bin/env python3
"""
Ingest S&P 500 earnings call transcripts from Hugging Face into Supabase.

Usage:
  python ingest.py --dry-run                    # Inspect dataset only
  python ingest.py --max-transcripts 10         # Test with 10 transcripts
  python ingest.py                              # Full ingestion
  python ingest.py --cleanup                      # Delete temp files after upload
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from datasets import load_dataset
from openai import OpenAI
from tqdm import tqdm

from chunker import chunk_transcript
from config import IngestConfig, period_in_range, parse_period
from db import SupabaseIngester

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def normalize_row(row: dict[str, Any], config: IngestConfig) -> dict[str, Any] | None:
    """Normalize a dataset row into our schema. Returns None if invalid."""
    datacqtr = row.get("datacqtr") or row.get("datafqtr")
    if not datacqtr:
        return None

    period = str(datacqtr).strip().upper()
    if not period_in_range(period, config.ingest_start_period, config.ingest_end_period):
        return None

    transcript = row.get("transcript")
    if not transcript or not str(transcript).strip():
        return None

    ticker = str(row.get("ticker", "")).strip().upper()
    company_name = str(row.get("company", "")).strip()
    if not ticker or not company_name:
        return None

    year, quarter = parse_period(period)

    earnings_date = row.get("earnings_date")
    call_date = None
    if earnings_date:
        call_date = str(earnings_date)[:10]

    return {
        "ticker": ticker,
        "company_name": company_name,
        "sector": row.get("sector"),
        "industry": row.get("industry"),
        "cik": str(row.get("cik", "")) if row.get("cik") else None,
        "headquarters": row.get("headquarters"),
        "fiscal_year": year,
        "fiscal_quarter": quarter,
        "period_string": period,
        "call_date": call_date,
        "transcript": str(transcript),
        "source_dataset": config.dataset_name,
        "source_url": config.source_url,
        "metadata": {
            "datafqtr": row.get("datafqtr"),
            "quarter_label": row.get("quarter"),
        },
    }


def inspect_dataset(config: IngestConfig) -> None:
    """Load and inspect the dataset without uploading."""
    logger.info("Loading dataset: %s", config.dataset_name)
    ds = load_dataset(config.dataset_name, split="train")

    logger.info("=" * 60)
    logger.info("DATASET INSPECTION")
    logger.info("=" * 60)
    logger.info("Columns: %s", ds.column_names)
    logger.info("Total rows: %d", len(ds))

    periods = sorted(set(str(r.get("datacqtr", "")) for r in ds if r.get("datacqtr")))
    logger.info("Period range: %s to %s", periods[0] if periods else "N/A", periods[-1] if periods else "N/A")
    logger.info("Unique periods: %d", len(periods))

    tickers = set(str(r.get("ticker", "")) for r in ds if r.get("ticker"))
    logger.info("Unique tickers: %d", len(tickers))

    # Filter stats
    filtered: list[dict[str, Any]] = []
    for record in ds:
        normalized = normalize_row(dict(record), config)
        if normalized:
            filtered.append(normalized)
    logger.info(
        "Rows in range %s–%s: %d",
        config.ingest_start_period,
        config.ingest_end_period,
        len(filtered),
    )

    if filtered:
        sample = filtered[0]
        logger.info("Sample row: ticker=%s, period=%s, company=%s", sample["ticker"], sample["period_string"], sample["company_name"])
        logger.info("Transcript length: %d chars", len(sample["transcript"]))
        chunks = chunk_transcript(
            sample["transcript"],
            config.chunk_size_tokens,
            config.chunk_overlap_tokens,
            config.embedding_model,
        )
        logger.info("Sample chunks: %d", len(chunks))

    logger.info("=" * 60)


def embed_batch(client: OpenAI, texts: list[str], model: str) -> list[list[float]]:
    """Generate embeddings for a batch of texts."""
    # Truncate to avoid token limits
    truncated = [t[:8000] for t in texts]
    response = client.embeddings.create(model=model, input=truncated)
    return [item.embedding for item in response.data]


def ingest(config: IngestConfig, dry_run: bool = False, cleanup: bool = False) -> None:
    if not dry_run:
        config.validate()

    config.temp_dir.mkdir(parents=True, exist_ok=True)
    progress_file = config.temp_dir / "progress.json"

    logger.info("Loading dataset: %s", config.dataset_name)
    ds = load_dataset(config.dataset_name, split="train")

    # Normalize and filter
    rows: list[dict[str, Any]] = []
    for record in ds:
        normalized = normalize_row(dict(record), config)
        if normalized:
            rows.append(normalized)

    logger.info("Filtered to %d transcripts (%s–%s)", len(rows), config.ingest_start_period, config.ingest_end_period)

    if config.max_transcripts:
        rows = rows[: config.max_transcripts]
        logger.info("Limited to %d transcripts (--max-transcripts)", config.max_transcripts)

    if dry_run:
        inspect_dataset(config)
        return

    # Initialize clients
    openai_client = OpenAI(api_key=config.openai_api_key)
    db = SupabaseIngester(config.supabase_url, config.supabase_service_key)

    # Resumability: skip already-ingested transcripts
    existing_keys = db.get_existing_transcript_keys()
    rows_to_process = [
        r for r in rows if f"{r['ticker']}:{r['period_string']}" not in existing_keys
    ]
    skipped = len(rows) - len(rows_to_process)
    if skipped:
        logger.info("Skipping %d already-ingested transcripts", skipped)

    total_chunks_uploaded = 0
    transcripts_processed = 0

    for row in tqdm(rows_to_process, desc="Ingesting transcripts"):
        try:
            # Upsert company
            company_id = db.upsert_company(row)

            # Upsert transcript
            transcript_id = db.upsert_transcript(row, company_id)

            # Chunk transcript
            chunks = chunk_transcript(
                row["transcript"],
                config.chunk_size_tokens,
                config.chunk_overlap_tokens,
                config.embedding_model,
            )

            if not chunks:
                logger.warning("No chunks for %s %s", row["ticker"], row["period_string"])
                continue

            # Generate embeddings in batches
            all_chunk_records: list[dict[str, Any]] = []
            texts = [c.chunk_text for c in chunks]

            for batch_start in range(0, len(texts), config.embedding_batch_size):
                batch_texts = texts[batch_start : batch_start + config.embedding_batch_size]
                batch_chunks = chunks[batch_start : batch_start + config.embedding_batch_size]

                embeddings = embed_batch(openai_client, batch_texts, config.embedding_model)

                for chunk, embedding in zip(batch_chunks, embeddings):
                    all_chunk_records.append(
                        {
                            "transcript_id": transcript_id,
                            "company_id": company_id,
                            "ticker": row["ticker"],
                            "company_name": row["company_name"],
                            "fiscal_year": row["fiscal_year"],
                            "fiscal_quarter": row["fiscal_quarter"],
                            "period_string": row["period_string"],
                            "sector": row.get("sector"),
                            "chunk_index": chunk.chunk_index,
                            "chunk_text": chunk.chunk_text,
                            "speaker": chunk.speaker,
                            "embedding": embedding,
                            "token_count": chunk.token_count,
                            "metadata": {},
                        }
                    )

                # Rate limit courtesy pause
                time.sleep(0.1)

            # Upload chunks in batches
            for batch_start in range(0, len(all_chunk_records), config.upload_batch_size):
                batch = all_chunk_records[batch_start : batch_start + config.upload_batch_size]
                uploaded = db.upsert_chunks(batch)
                total_chunks_uploaded += uploaded

            transcripts_processed += 1

            # Save progress
            progress_file.write_text(
                json.dumps(
                    {
                        "last_ticker": row["ticker"],
                        "last_period": row["period_string"],
                        "transcripts_processed": transcripts_processed,
                        "chunks_uploaded": total_chunks_uploaded,
                    }
                )
            )

        except Exception as e:
            logger.error("Failed to ingest %s %s: %s", row["ticker"], row["period_string"], e)
            continue

    # Update corpus metadata
    total_transcripts = db.count_transcripts()
    total_chunks = db.count_chunks()
    db.update_corpus_metadata(
        config.ingest_start_period,
        config.ingest_end_period,
        total_transcripts,
        total_chunks,
    )

    logger.info("=" * 60)
    logger.info("INGESTION COMPLETE")
    logger.info("Transcripts processed this run: %d", transcripts_processed)
    logger.info("Chunks uploaded this run: %d", total_chunks_uploaded)
    logger.info("Total transcripts in DB: %d", total_transcripts)
    logger.info("Total chunks in DB: %d", total_chunks)
    logger.info("=" * 60)

    if cleanup or config.cleanup_temp_files:
        cleanup_temp(config.temp_dir)


def cleanup_temp(temp_dir: Path) -> None:
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
        logger.info("Cleaned up temp directory: %s", temp_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest S&P 500 earnings transcripts")
    parser.add_argument("--dry-run", action="store_true", help="Inspect dataset without uploading")
    parser.add_argument("--max-transcripts", type=int, default=None, help="Limit number of transcripts")
    parser.add_argument("--cleanup", action="store_true", help="Delete temp files after upload")
    parser.add_argument("--start-period", type=str, default=None, help="Override start period")
    parser.add_argument("--end-period", type=str, default=None, help="Override end period")
    args = parser.parse_args()

    config = IngestConfig.from_env()

    if args.max_transcripts:
        config = IngestConfig(
            **{
                **config.__dict__,
                "max_transcripts": args.max_transcripts,
            }
        )

    if args.start_period:
        config = IngestConfig(**{**config.__dict__, "ingest_start_period": args.start_period})
    if args.end_period:
        config = IngestConfig(**{**config.__dict__, "ingest_end_period": args.end_period})

    try:
        if args.dry_run:
            inspect_dataset(config)
        else:
            ingest(config, cleanup=args.cleanup)
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error("Fatal error: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
