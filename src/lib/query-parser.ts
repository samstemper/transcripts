import { parsePeriod, formatPeriod } from "./utils";
import type { QueryPlan, TimeFilter } from "./types";
import { config } from "./config";
import { chatCompletion } from "./openai";
import { resolveCompany } from "./supabase";

const INLINE_FILTER_REGEX = /@(\w+):\s*([^\s@]+(?:\s*-\s*[^\s@]+)?)/gi;

interface ParsedFilters {
  company?: string;
  ticker?: string;
  time?: string;
  sector?: string;
  limit?: string;
}

function parseInlineFilters(query: string): ParsedFilters {
  const filters: ParsedFilters = {};
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE_FILTER_REGEX.source, "gi");
  while ((match = regex.exec(query)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "company") filters.company = value;
    else if (key === "ticker") filters.ticker = value;
    else if (key === "time") filters.time = value;
    else if (key === "sector") filters.sector = value;
    else if (key === "limit") filters.limit = value;
  }
  return filters;
}

function parseTimeFilter(timeStr: string): TimeFilter {
  const trimmed = timeStr.trim();

  // Single period: 2025Q1
  const singleMatch = trimmed.match(/^(\d{4})Q([1-4])$/i);
  if (singleMatch) {
    const year = parseInt(singleMatch[1], 10);
    const quarter = parseInt(singleMatch[2], 10);
    return {
      periods: [formatPeriod(year, quarter)],
      yearMin: year,
      yearMax: year,
      quarterMin: quarter,
      quarterMax: quarter,
      display: formatPeriod(year, quarter),
    };
  }

  // Year only: 2024
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return {
      yearMin: year,
      yearMax: year,
      quarterMin: 1,
      quarterMax: 4,
      display: `${year}`,
    };
  }

  // Range: 2024-2025
  const rangeMatch = trimmed.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (rangeMatch) {
    const yearMin = parseInt(rangeMatch[1], 10);
    const yearMax = parseInt(rangeMatch[2], 10);
    return {
      yearMin,
      yearMax,
      quarterMin: 1,
      quarterMax: 4,
      display: `${yearMin}Q1–${yearMax}Q4`,
    };
  }

  return { display: trimmed };
}

function validateTimeFilter(filter: TimeFilter | null): string | null {
  if (!filter) return null;

  const demoMin = parsePeriod(config.demoMinPeriod());
  const demoMax = parsePeriod(config.demoMaxPeriod());
  if (!demoMin || !demoMax) return null;

  const demoMinKey = demoMin.year * 10 + demoMin.quarter;
  const demoMaxKey = demoMax.year * 10 + demoMax.quarter;

  if (filter.periods?.length) {
    for (const p of filter.periods) {
      const parsed = parsePeriod(p);
      if (!parsed) continue;
      const key = parsed.year * 10 + parsed.quarter;
      if (key < demoMinKey || key > demoMaxKey) {
        return `No transcripts were found for ${p}. This demo currently includes calls through ${config.demoMaxPeriod()}. Try @time: ${config.demoMaxPeriod()} or @time: ${demoMin.year}.`;
      }
    }
  }

  if (filter.yearMin !== undefined) {
    const minKey = filter.yearMin * 10 + (filter.quarterMin ?? 1);
    const maxKey = (filter.yearMax ?? filter.yearMin) * 10 + (filter.quarterMax ?? 4);
    if (minKey > demoMaxKey || maxKey < demoMinKey) {
      return `No transcripts were found for ${filter.display}. This demo currently includes calls through ${config.demoMaxPeriod()}. Try @time: ${config.demoMaxPeriod()} or @time: ${demoMin.year}.`;
    }
  }

  return null;
}

const QUERY_PLAN_SYSTEM = `You parse user queries about S&P 500 earnings call transcripts into structured JSON plans.

Output ONLY valid JSON with this schema:
{
  "query_type": "targeted" | "discovery" | "comparison",
  "semantic_topic": "the core topic to search for semantically",
  "companies": ["company names mentioned"],
  "tickers": ["tickers if explicitly mentioned or well-known"],
  "time_filter": "time expression or null",
  "sector_filter": "sector name or null",
  "limit": 10,
  "comparison_entities": ["entity1", "entity2"]
}

Rules:
- query_type "targeted": asking what ONE specific company said about a topic
- query_type "discovery": asking which companies mention a topic (broad search)
- query_type "comparison": comparing two or more companies on a topic
- Separate metadata filters from semantic topic. semantic_topic should NOT include company names, dates, or "compare"
- For comparisons, put both entities in comparison_entities AND companies
- Expand semantic_topic with related terms for better retrieval (e.g., "AI capex" -> "AI capital expenditure, AI infrastructure investment, data center spending")
- Default limit: 10 for discovery, 15 for targeted, 10 per entity for comparison
- Recognize natural language time: "Q1 2025" -> "2025Q1", "in 2024" -> "2024", "2024-2025" -> "2024-2025"
- Recognize company aliases: Google/Alphabet -> GOOGL, Meta/Facebook -> META`;

export async function parseQuery(rawQuery: string): Promise<{
  plan: QueryPlan;
  timeError: string | null;
}> {
  const inlineFilters = parseInlineFilters(rawQuery);
  const cleanQuery = rawQuery.replace(INLINE_FILTER_REGEX, "").replace(/\s+/g, " ").trim();

  let llmPlan: Record<string, unknown> = {};
  try {
    const llmResponse = await chatCompletion(
      QUERY_PLAN_SYSTEM,
      `Parse this query: "${cleanQuery || rawQuery}"`,
      500
    );
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      llmPlan = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall back to heuristics
  }

  const queryType = (llmPlan.query_type as QueryPlan["query_type"]) ??
    (/\bcompare\b/i.test(rawQuery) ? "comparison" :
     /\bwhich companies\b|\bwho is\b|\bwho are\b/i.test(rawQuery) ? "discovery" :
     "targeted");

  const semanticTopic = (llmPlan.semantic_topic as string) || cleanQuery || rawQuery;

  let companies = (llmPlan.companies as string[]) ?? [];
  let tickers = (llmPlan.tickers as string[]) ?? [];
  const comparisonEntities = (llmPlan.comparison_entities as string[]) ?? [];

  if (inlineFilters.company) {
    companies = [inlineFilters.company, ...companies.filter((c) => c !== inlineFilters.company)];
  }
  if (inlineFilters.ticker) {
    tickers = [inlineFilters.ticker.toUpperCase(), ...tickers];
  }

  // Resolve company names to tickers
  const resolvedTickers = new Set<string>(tickers.map((t) => t.toUpperCase()));
  const resolvedCompanies = new Set<string>(companies);

  for (const name of [...companies, ...comparisonEntities]) {
    try {
      const matches = await resolveCompany(name);
      if (matches.length > 0) {
        resolvedTickers.add(matches[0].ticker);
        resolvedCompanies.add(matches[0].company_name);
      }
    } catch {
      // continue without DB resolution
    }
  }

  const timeStr = inlineFilters.time ?? (llmPlan.time_filter as string | null) ?? null;
  const timeFilter = timeStr ? parseTimeFilter(timeStr) : null;
  const timeError = validateTimeFilter(timeFilter);

  const sectorFilter = inlineFilters.sector ?? (llmPlan.sector_filter as string | null) ?? null;
  const limit = inlineFilters.limit
    ? parseInt(inlineFilters.limit, 10)
    : (llmPlan.limit as number) ?? (queryType === "targeted" ? 15 : 10);

  const plan: QueryPlan = {
    query_type: queryType,
    semantic_topic: semanticTopic,
    companies: [...resolvedCompanies],
    tickers: [...resolvedTickers],
    time_filter: timeFilter,
    sector_filter: sectorFilter,
    limit: Math.min(Math.max(limit, 1), 30),
    comparison_entities: comparisonEntities.length ? comparisonEntities : companies,
    raw_query: rawQuery,
  };

  return { plan, timeError };
}

export function buildInterpretedQuery(plan: QueryPlan): {
  topic: string;
  companies: string[];
  period: string;
  evidence_note: string;
} {
  const period = plan.time_filter?.display ?? `${config.demoMinPeriod()}–${config.demoMaxPeriod()}`;
  const companies =
    plan.query_type === "comparison"
      ? plan.comparison_entities
      : plan.companies.length
        ? plan.companies
        : plan.query_type === "discovery"
          ? ["All S&P 500 companies"]
          : [];

  return {
    topic: plan.semantic_topic,
    companies,
    period,
    evidence_note: "recent S&P 500 earnings-call excerpts",
  };
}
