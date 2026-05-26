import type { QueryPlan, RetrievedChunk } from "./types";
import { embedText } from "./openai";
import { searchChunks, getAdjacentChunks, getTranscriptCallDate, resolveCompany } from "./supabase";
import { config } from "./config";
import { resolveSpeaker, speakerRankBoost } from "./speaker";

function mapRow(row: Record<string, unknown>): RetrievedChunk {
  return {
    id: row.id as string,
    transcript_id: row.transcript_id as string,
    company_id: row.company_id as string,
    ticker: row.ticker as string,
    company_name: row.company_name as string,
    fiscal_year: row.fiscal_year as number,
    fiscal_quarter: row.fiscal_quarter as number,
    period_string: row.period_string as string,
    sector: (row.sector as string) ?? null,
    chunk_index: row.chunk_index as number,
    chunk_text: row.chunk_text as string,
    speaker: (row.speaker as string) ?? null,
    token_count: (row.token_count as number) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    similarity: row.similarity as number,
  };
}

function buildFilterParams(plan: QueryPlan, tickerOverride?: string) {
  const tickers = tickerOverride
    ? [tickerOverride]
    : plan.tickers.length
      ? plan.tickers
      : null;

  return {
    filterTickers: tickers,
    filterSectors: plan.sector_filter ? [plan.sector_filter] : null,
    filterPeriods: plan.time_filter?.periods ?? null,
    filterYearMin: plan.time_filter?.yearMin ?? null,
    filterYearMax: plan.time_filter?.yearMax ?? null,
    filterQuarterMin: plan.time_filter?.quarterMin ?? null,
    filterQuarterMax: plan.time_filter?.quarterMax ?? null,
  };
}

async function enrichChunks(chunks: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  return Promise.all(
    chunks.map(async (chunk) => {
      const adjacent = await getAdjacentChunks(chunk.transcript_id, chunk.chunk_index);
      const before = adjacent.find((a: { chunk_index: number }) => a.chunk_index === chunk.chunk_index - 1);
      const after = adjacent.find((a: { chunk_index: number }) => a.chunk_index === chunk.chunk_index + 1);
      const callDate = await getTranscriptCallDate(chunk.transcript_id);

      return {
        ...chunk,
        context_before: before?.chunk_text ?? null,
        context_after: after?.chunk_text ?? null,
        metadata: { ...chunk.metadata, call_date: callDate },
      };
    })
  );
}

async function searchWithFallback(
  embedding: number[],
  matchCount: number,
  filters: ReturnType<typeof buildFilterParams>,
  hasCompanyFilter: boolean
): Promise<RetrievedChunk[]> {
  // When a company/ticker filter is applied, metadata already narrows scope —
  // use a lower threshold since topic embeddings often score 0.20–0.28 for
  // relevant excerpts that don't closely match the expanded semantic topic.
  const thresholds = hasCompanyFilter ? [0.28, 0.22, 0.18] : [0.28, 0.24, 0.2];

  for (const threshold of thresholds) {
    const rows = await searchChunks({
      queryEmbedding: embedding,
      matchCount,
      ...filters,
      similarityThreshold: threshold,
    });
    if (rows.length > 0) {
      return rows.map(mapRow);
    }
  }

  return [];
}

function rankBySpeakerPreference(chunks: RetrievedChunk[], plan: QueryPlan): RetrievedChunk[] {
  const preferManagement =
    plan.query_type === "targeted" || plan.query_type === "comparison";

  return [...chunks].sort((a, b) => {
    const roleA = resolveSpeaker(a).role;
    const roleB = resolveSpeaker(b).role;
    const scoreA = a.similarity + speakerRankBoost(roleA, preferManagement);
    const scoreB = b.similarity + speakerRankBoost(roleB, preferManagement);
    return scoreB - scoreA;
  });
}

export async function retrieveForPlan(plan: QueryPlan): Promise<RetrievedChunk[]> {
  const embedding = await embedText(plan.semantic_topic);
  const maxChunks = Math.min(plan.limit, config.maxRetrievedChunks());

  if (plan.query_type === "comparison") {
    const allChunks: RetrievedChunk[] = [];
    const seen = new Set<string>();

    for (const entity of plan.comparison_entities) {
      let ticker: string | null = null;
      const matches = await resolveCompany(entity);
      if (matches.length > 0) {
        ticker = matches[0].ticker;
      }

      const perEntityLimit = Math.ceil(maxChunks / plan.comparison_entities.length);
      const filters = buildFilterParams(plan, ticker ?? undefined);
      const entityChunks = await searchWithFallback(
        embedding,
        perEntityLimit,
        filters,
        Boolean(ticker ?? filters.filterTickers?.length)
      );

      for (const chunk of entityChunks) {
        const key = `${chunk.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          allChunks.push(chunk);
        }
      }
    }

    return enrichChunks(rankBySpeakerPreference(allChunks, plan));
  }

  const filters = buildFilterParams(plan);
  const matchCount = plan.query_type === "discovery" ? maxChunks : Math.min(maxChunks, 20);
  const hasCompanyFilter = Boolean(filters.filterTickers?.length);

  let chunks = await searchWithFallback(embedding, matchCount, filters, hasCompanyFilter);

  if (plan.query_type === "discovery") {
    chunks = groupByCompany(chunks, maxChunks);
  }

  return enrichChunks(rankBySpeakerPreference(chunks, plan));
}

function groupByCompany(chunks: RetrievedChunk[], maxTotal: number): RetrievedChunk[] {
  const byCompany = new Map<string, RetrievedChunk[]>();

  for (const chunk of chunks) {
    const key = chunk.ticker;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(chunk);
  }

  const result: RetrievedChunk[] = [];
  const companies = [...byCompany.entries()].sort(
    (a, b) => (b[1][0]?.similarity ?? 0) - (a[1][0]?.similarity ?? 0)
  );

  const perCompany = Math.max(2, Math.floor(maxTotal / Math.min(companies.length, 10)));

  for (const [, companyChunks] of companies) {
    result.push(...companyChunks.slice(0, perCompany));
    if (result.length >= maxTotal) break;
  }

  return result.slice(0, maxTotal);
}

export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
