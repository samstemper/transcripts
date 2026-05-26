# Earnings Insight

A polished public demo RAG app for searching recent S&P 500 earnings-call transcripts. Ask natural-language questions and get grounded, cited answers from real transcript excerpts.

Built with Next.js, Supabase (Postgres + pgvector), OpenAI embeddings, and a Python ingestion pipeline.

## Features

- **Three query modes**: targeted (single company), discovery (cross-company), and comparison (side-by-side)
- **Inline filters**: `@company:`, `@ticker:`, `@time:`, `@sector:`, `@limit:`
- **Natural language parsing**: LLM-powered query plan extraction
- **Cited answers**: every claim linked to numbered transcript excerpts
- **Evidence panel**: click citations to view source chunks with highlights
- **Shareable URLs**: `?q=...` encodes queries for easy sharing
- **Rate limiting**: IP-based protection for public deployment

## Data Source

**[glopardo/sp500-earnings-transcripts](https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts)** on Hugging Face.

- Full dataset coverage: 2013Q2–2025Q1
- Demo corpus: **2024Q1–2025Q1** (configurable)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | Supabase Postgres + pgvector |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o-mini` |
| Ingestion | Python (datasets, openai, supabase) |
| Deployment | Cloudflare Pages via OpenNext |

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> earnings-insight
cd earnings-insight
npm install
```

### 2. Set up Supabase

1. Create a [Supabase](https://supabase.com) project
2. Run the migration in `supabase/migrations/001_initial_schema.sql` via the SQL Editor
3. Copy your project URL and service role key

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

```env
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Ingest data

```bash
cd ingestion
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys

# Inspect dataset (no upload)
python ingest.py --dry-run

# Test with 10 transcripts
python ingest.py --max-transcripts 10

# Full ingestion (2024Q1–2025Q1)
python ingest.py --cleanup
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Ingestion Options

| Flag / Env | Description | Default |
|-----------|-------------|---------|
| `--dry-run` | Inspect dataset without uploading | — |
| `--max-transcripts N` | Limit transcripts for testing | all |
| `--cleanup` | Delete temp files after upload | `CLEANUP_TEMP_FILES=true` |
| `INGEST_START_PERIOD` | Start period filter | `2024Q1` |
| `INGEST_END_PERIOD` | End period filter | `2025Q1` |
| `CHUNK_SIZE_TOKENS` | Chunk size | `512` |
| `CHUNK_OVERLAP_TOKENS` | Overlap between chunks | `64` |
| `EMBEDDING_BATCH_SIZE` | OpenAI embedding batch size | `100` |

The ingestion pipeline is **idempotent** — rerunning skips already-ingested transcripts and upserts chunks without duplicates.

## Example Queries

**Targeted:**
```
What did Microsoft say about AI capex? @time: 2025Q1
What did Nvidia say about data center demand? @time: 2025Q1
```

**Discovery:**
```
Which companies are talking about China demand weakness? @time: 2025Q1
Which companies mention tariffs? @time: 2024-2025
```

**Comparison:**
```
Compare Microsoft and Google on AI infrastructure spending @time: 2024-2025
Compare Nvidia and AMD on data center demand @time: 2025Q1
```

## Project Structure

```
├── src/
│   ├── app/                  # Next.js pages and API routes
│   ├── components/           # React UI components
│   └── lib/                  # Query parser, retrieval, answer gen
├── ingestion/
│   ├── ingest.py             # Main ingestion script
│   ├── chunker.py            # Speaker-aware chunking
│   ├── db.py                 # Supabase upload helpers
│   └── config.py             # Ingestion configuration
├── supabase/
│   └── migrations/           # SQL schema + RPC functions
├── .env.example
├── wrangler.toml             # Cloudflare Pages config
└── open-next.config.ts       # OpenNext adapter config
```

## Deploy to Cloudflare Pages

### Prerequisites

- Cloudflare account
- GitHub repository connected to Cloudflare Pages

### Steps

1. **Build settings** in Cloudflare Pages dashboard:
   - Build command: `npm run build:cloudflare`
   - Deploy command: `npm run deploy:cloudflare`

2. **Environment variables** (set in Cloudflare dashboard → Settings → Environment variables):
   ```
   OPENAI_API_KEY
   NEXT_PUBLIC_SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   OPENAI_CHAT_MODEL=gpt-4o-mini
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   DEMO_MIN_PERIOD=2024Q1
   DEMO_MAX_PERIOD=2025Q1
   ```

3. **Deploy:**
   ```bash
   npm run deploy:cloudflare
   ```

4. **Local preview with Cloudflare runtime:**
   ```bash
   npm run preview:cloudflare
   ```

> **Note:** API routes run as Cloudflare Functions. The OpenAI and Supabase keys remain server-side only.

## GitHub Codespaces Ingestion

1. Open the repo in a Codespace
2. Run Supabase migration (copy SQL to Supabase dashboard)
3. Set environment variables in `ingestion/.env`
4. Run:
   ```bash
   cd ingestion
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   python ingest.py --max-transcripts 10   # test first
   python ingest.py --cleanup              # full run
   ```

Codespaces provides sufficient compute and network access for Hugging Face downloads and OpenAI embedding calls.

## Security

- OpenAI and Supabase service keys are **server-side only**
- IP-based rate limiting (20 requests/minute by default)
- Max query length: 500 characters
- Max retrieved chunks: 30
- No user-supplied SQL
- Graceful handling of OpenAI quota/rate-limit errors

## License

MIT. Dataset attribution required — see [Hugging Face dataset page](https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts).
