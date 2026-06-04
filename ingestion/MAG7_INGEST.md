# Mag 7 ingest (after wiping Supabase)

## 1. Run this SQL first (Supabase → SQL Editor)

Paste and run `setup_bulk_ingest.sql` (drops the vector index + adds RPC helpers), **or** at minimum:

```sql
DROP INDEX IF EXISTS idx_chunks_embedding;
```

Without this step, chunk upserts often hit `statement timeout` on the free tier.

## 2. Wipe data (if re-starting)

```sql
DELETE FROM transcripts;
DELETE FROM companies;
```

## 3. Ingest

```bash
cd ingestion
source .venv/bin/activate
python ingest.py --dry-run
python ingest.py --cleanup --rebuild-vector-index
```

Expect **36 transcripts** (Mag 7 + both `GOOG` and `GOOGL`).

## 4. After ingest

If you did not use `--rebuild-vector-index`, run `rebuild_vector_index.sql` in the SQL Editor.
