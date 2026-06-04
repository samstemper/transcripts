-- Paste into Supabase → SQL Editor → Run AFTER ingest completes
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
