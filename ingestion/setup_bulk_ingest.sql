-- Run once in Supabase → SQL Editor before resuming ingestion.
-- Fixes "canceling statement due to statement timeout" on chunk upserts.

-- 1) Drop HNSW index (bulk inserts without per-row index maintenance)
DROP INDEX IF EXISTS idx_chunks_embedding;

-- 2) RPC helpers so ingest.py can drop/recreate automatically on future runs
CREATE OR REPLACE FUNCTION public.drop_chunks_embedding_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DROP INDEX IF EXISTS idx_chunks_embedding;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_chunks_embedding_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_chunks_embedding'
  ) THEN
    CREATE INDEX idx_chunks_embedding ON public.chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.drop_chunks_embedding_index() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_chunks_embedding_index() TO service_role;
