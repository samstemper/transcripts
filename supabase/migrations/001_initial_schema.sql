-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  cik TEXT,
  headquarters TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_ticker ON companies (ticker);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies (sector);
CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies (company_name);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
  period_string TEXT NOT NULL,
  call_date DATE,
  source_dataset TEXT NOT NULL DEFAULT 'glopardo/sp500-earnings-transcripts',
  source_url TEXT NOT NULL DEFAULT 'https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, period_string)
);

CREATE INDEX IF NOT EXISTS idx_transcripts_ticker ON transcripts (ticker);
CREATE INDEX IF NOT EXISTS idx_transcripts_company_id ON transcripts (company_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_fiscal_year ON transcripts (fiscal_year);
CREATE INDEX IF NOT EXISTS idx_transcripts_fiscal_quarter ON transcripts (fiscal_quarter);
CREATE INDEX IF NOT EXISTS idx_transcripts_period_string ON transcripts (period_string);
CREATE INDEX IF NOT EXISTS idx_transcripts_period_year_quarter ON transcripts (fiscal_year, fiscal_quarter);

-- Chunks table with embeddings (text-embedding-3-small = 1536 dimensions)
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
  period_string TEXT NOT NULL,
  sector TEXT,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  speaker TEXT,
  embedding vector(1536),
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_ticker ON chunks (ticker);
CREATE INDEX IF NOT EXISTS idx_chunks_company_id ON chunks (company_id);
CREATE INDEX IF NOT EXISTS idx_chunks_transcript_id ON chunks (transcript_id);
CREATE INDEX IF NOT EXISTS idx_chunks_fiscal_year ON chunks (fiscal_year);
CREATE INDEX IF NOT EXISTS idx_chunks_fiscal_quarter ON chunks (fiscal_quarter);
CREATE INDEX IF NOT EXISTS idx_chunks_period_string ON chunks (period_string);
CREATE INDEX IF NOT EXISTS idx_chunks_sector ON chunks (sector);
CREATE INDEX IF NOT EXISTS idx_chunks_period_year_quarter ON chunks (fiscal_year, fiscal_quarter);

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Corpus metadata for demo bounds
CREATE TABLE IF NOT EXISTS corpus_metadata (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_period TEXT NOT NULL,
  max_period TEXT NOT NULL,
  total_transcripts INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  source_dataset TEXT NOT NULL DEFAULT 'glopardo/sp500-earnings-transcripts',
  source_url TEXT NOT NULL DEFAULT 'https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO corpus_metadata (min_period, max_period, total_transcripts, total_chunks)
VALUES ('2024Q1', '2025Q1', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Vector search RPC: filtered semantic retrieval
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 20,
  filter_tickers TEXT[] DEFAULT NULL,
  filter_sectors TEXT[] DEFAULT NULL,
  filter_periods TEXT[] DEFAULT NULL,
  filter_year_min INTEGER DEFAULT NULL,
  filter_year_max INTEGER DEFAULT NULL,
  filter_quarter_min INTEGER DEFAULT NULL,
  filter_quarter_max INTEGER DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.25
)
RETURNS TABLE (
  id UUID,
  transcript_id UUID,
  company_id UUID,
  ticker TEXT,
  company_name TEXT,
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  period_string TEXT,
  sector TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  speaker TEXT,
  token_count INTEGER,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.transcript_id,
    c.company_id,
    c.ticker,
    c.company_name,
    c.fiscal_year,
    c.fiscal_quarter,
    c.period_string,
    c.sector,
    c.chunk_index,
    c.chunk_text,
    c.speaker,
    c.token_count,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM chunks c
  WHERE c.embedding IS NOT NULL
    AND (filter_tickers IS NULL OR c.ticker = ANY(filter_tickers))
    AND (filter_sectors IS NULL OR c.sector ILIKE ANY(
      SELECT '%' || unnest(filter_sectors) || '%'
    ))
    AND (filter_periods IS NULL OR c.period_string = ANY(filter_periods))
    AND (filter_year_min IS NULL OR c.fiscal_year >= filter_year_min)
    AND (filter_year_max IS NULL OR c.fiscal_year <= filter_year_max)
    AND (filter_year_min IS NULL OR c.fiscal_year > filter_year_min OR (
      c.fiscal_year = filter_year_min AND (
        filter_quarter_min IS NULL OR c.fiscal_quarter >= filter_quarter_min
      )
    ))
    AND (filter_year_max IS NULL OR c.fiscal_year < filter_year_max OR (
      c.fiscal_year = filter_year_max AND (
        filter_quarter_max IS NULL OR c.fiscal_quarter <= filter_quarter_max
      )
    ))
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Get adjacent chunks for context
CREATE OR REPLACE FUNCTION get_adjacent_chunks(
  p_transcript_id UUID,
  p_chunk_index INTEGER
)
RETURNS TABLE (
  chunk_index INTEGER,
  chunk_text TEXT,
  speaker TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT chunk_index, chunk_text, speaker
  FROM chunks
  WHERE transcript_id = p_transcript_id
    AND chunk_index BETWEEN p_chunk_index - 1 AND p_chunk_index + 1
  ORDER BY chunk_index;
$$;

-- Resolve company name/ticker lookup
CREATE OR REPLACE FUNCTION resolve_company(search_term TEXT)
RETURNS TABLE (
  id UUID,
  ticker TEXT,
  company_name TEXT,
  sector TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT id, ticker, company_name, sector
  FROM companies
  WHERE ticker ILIKE search_term
     OR company_name ILIKE search_term
     OR company_name ILIKE '%' || search_term || '%'
  ORDER BY
    CASE WHEN ticker ILIKE search_term THEN 0
         WHEN company_name ILIKE search_term THEN 1
         ELSE 2 END,
    company_name
  LIMIT 5;
$$;
