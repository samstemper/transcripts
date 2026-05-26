"""Ingestion configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load from ingestion/.env then project root .env
INGESTION_DIR = Path(__file__).parent
load_dotenv(INGESTION_DIR / ".env")
load_dotenv(INGESTION_DIR.parent / ".env")


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key, "").lower()
    if raw in ("true", "1", "yes"):
        return True
    if raw in ("false", "0", "no"):
        return False
    return default


@dataclass(frozen=True)
class IngestConfig:
    openai_api_key: str
    supabase_url: str
    supabase_service_key: str
    ingest_start_period: str
    ingest_end_period: str
    max_transcripts: int | None
    embedding_model: str
    chunk_size_tokens: int
    chunk_overlap_tokens: int
    cleanup_temp_files: bool
    embedding_batch_size: int
    upload_batch_size: int
    temp_dir: Path
    dataset_name: str = "glopardo/sp500-earnings-transcripts"
    source_url: str = "https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts"

    @classmethod
    def from_env(cls) -> "IngestConfig":
        max_raw = _env("MAX_TRANSCRIPTS")
        return cls(
            openai_api_key=_env("OPENAI_API_KEY"),
            supabase_url=_env("SUPABASE_URL") or _env("NEXT_PUBLIC_SUPABASE_URL"),
            supabase_service_key=_env("SUPABASE_SERVICE_ROLE_KEY"),
            ingest_start_period=_env("INGEST_START_PERIOD", "2024Q1"),
            ingest_end_period=_env("INGEST_END_PERIOD", "2025Q1"),
            max_transcripts=int(max_raw) if max_raw.strip() else None,
            embedding_model=_env("EMBEDDING_MODEL", "text-embedding-3-small"),
            chunk_size_tokens=_env_int("CHUNK_SIZE_TOKENS", 512),
            chunk_overlap_tokens=_env_int("CHUNK_OVERLAP_TOKENS", 64),
            cleanup_temp_files=_env_bool("CLEANUP_TEMP_FILES", True),
            embedding_batch_size=_env_int("EMBEDDING_BATCH_SIZE", 100),
            upload_batch_size=_env_int("UPLOAD_BATCH_SIZE", 50),
            temp_dir=INGESTION_DIR / ".temp",
        )

    def validate(self) -> None:
        missing = []
        if not self.openai_api_key:
            missing.append("OPENAI_API_KEY")
        if not self.supabase_url:
            missing.append("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL")
        if not self.supabase_service_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


def parse_period(period: str) -> tuple[int, int]:
    """Parse '2024Q1' -> (2024, 1)."""
    period = period.strip().upper()
    if len(period) != 6 or period[4] != "Q":
        raise ValueError(f"Invalid period format: {period}")
    return int(period[:4]), int(period[5])


def period_key(year: int, quarter: int) -> int:
    return year * 10 + quarter


def period_in_range(period: str, start: str, end: str) -> bool:
    y, q = parse_period(period)
    sy, sq = parse_period(start)
    ey, eq = parse_period(end)
    key = period_key(y, q)
    return period_key(sy, sq) <= key <= period_key(ey, eq)
