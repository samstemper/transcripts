# Earnings Insight

Search recent S&P 500 earnings-call transcripts with natural-language questions. Answers are grounded in retrieved excerpts with citations.

**Stack:** Next.js · Supabase (pgvector) · OpenAI · Python ingestion · Cloudflare

**Data:** [glopardo/sp500-earnings-transcripts](https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts) — demo uses 2024Q1–2025Q1 (~2,190 calls).

## Setup

1. **Supabase** — create a project, run `supabase/migrations/001_initial_schema.sql` in the SQL Editor.

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
   python ingest.py --max-transcripts 10   # test
   python ingest.py --cleanup              # full corpus
   ```

   To re-ingest, delete existing rows first: `DELETE FROM transcripts;` in Supabase (chunks cascade). Reruns skip transcripts already in the DB.

## Deploy (Cloudflare)

Set the same env vars in the Cloudflare dashboard, then:

```bash
npm run deploy:cloudflare
```

Preview locally: `npm run preview:cloudflare`

## Example query

```
What did Microsoft say about AI capex? @time: 2025Q1
```

Inline filters: `@company:`, `@ticker:`, `@time:`, `@sector:`, `@limit:`
