# Earnings Insight

Semantic search over earnings-call transcripts with cited answers, on a **small demo corpus** (Mag 7 and a short quarter range), not broad market coverage. The ingestion pipeline can scale to more tickers and periods; this repo defaults to a narrow slice so the idea is easy to try end-to-end.

Search Magnificent Seven (Mag 7) earnings-call transcripts with natural-language questions. Answers are grounded in retrieved excerpts with citations.

**Stack:** Next.js · Supabase (pgvector) · OpenAI · Python ingestion · Cloudflare

**Data:** [glopardo/sp500-earnings-transcripts](https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts) — demo ingests **Mag 7 only** (`AAPL`, `MSFT`, `GOOGL`, `GOOG`, `AMZN`, `META`, `NVDA`, `TSLA`) for **2024Q1–2025Q1** (~35 calls).

## Setup

1. **Supabase** — create a project, run `supabase/migrations/001_initial_schema.sql` in the SQL Editor. Optionally run `002_bulk_ingest_index_ops.sql` for faster bulk ingest helpers.

2. **Env** — copy `.env.example` → `.env.local` and fill in `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

3. **Install & run**
   ```bash
   npm install
   npm run dev
   ```

4. **Ingest** (separate terminal)
   ```bash
   cd ingestion
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env   # add your keys
   python ingest.py --dry-run              # expect ~35 transcripts
   python ingest.py --cleanup --rebuild-vector-index
   ```

   To re-ingest, wipe data in Supabase:
   ```sql
   DELETE FROM transcripts;
   DELETE FROM companies;
   ```
   Reruns skip transcripts that already have enough chunks in the DB.

## Deploy (Cloudflare)

Set the same env vars in the Cloudflare dashboard, then:

```bash
npm run deploy:cloudflare
```

Preview locally: `npm run preview:cloudflare`

## Example query

```
What did Microsoft say about AI capex? @quarter: 2025Q1
```

Inline filters: `@company:`, `@ticker:`, `@quarter:` (quarters only, e.g. `2025Q1`)

## Corpus configuration

| Variable | Purpose |
|----------|---------|
| `INGEST_TICKERS` | Comma-separated allowlist (default: Mag 7). Use `*` for full S&P 500. |
| `INGEST_START_PERIOD` / `INGEST_END_PERIOD` | Quarter range, e.g. `2024Q1`–`2025Q1` |
| `DEMO_TICKERS` | App autocomplete allowlist (defaults to Mag 7) |
