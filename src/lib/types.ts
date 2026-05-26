export type QueryType = "targeted" | "discovery" | "comparison";

export interface TimeFilter {
  periods?: string[];
  yearMin?: number;
  yearMax?: number;
  quarterMin?: number;
  quarterMax?: number;
  display: string;
}

export interface QueryPlan {
  query_type: QueryType;
  semantic_topic: string;
  companies: string[];
  tickers: string[];
  time_filter: TimeFilter | null;
  sector_filter: string | null;
  limit: number;
  comparison_entities: string[];
  raw_query: string;
}

export interface RetrievedChunk {
  id: string;
  transcript_id: string;
  company_id: string;
  ticker: string;
  company_name: string;
  fiscal_year: number;
  fiscal_quarter: number;
  period_string: string;
  sector: string | null;
  chunk_index: number;
  chunk_text: string;
  speaker: string | null;
  token_count: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
  highlight_sentences?: string[];
  context_before?: string | null;
  context_after?: string | null;
}

export interface Citation {
  index: number;
  chunk_id: string;
  ticker: string;
  company_name: string;
  period_string: string;
  speaker: string | null;
  excerpt: string;
  call_date?: string | null;
}

export interface SearchResponse {
  parsed_plan: QueryPlan;
  interpreted_query: {
    topic: string;
    companies: string[];
    period: string;
    evidence_note: string;
  };
  answer: string;
  citations: Citation[];
  evidence: RetrievedChunk[];
  error?: string;
  warning?: string;
}

export interface CompanyMatch {
  id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
}

export const EXAMPLE_QUERIES = {
  discovery: [
    "Which companies are talking about China demand weakness? @time: 2025Q1",
    "Which companies mention tariffs? @time: 2024-2025",
    "Who is discussing AI infrastructure spending?",
  ],
  targeted: [
    "What did Microsoft say about AI capex? @time: 2025Q1",
    "What did Nvidia say about data center demand? @time: 2025Q1",
    "What did Walmart say about consumer weakness? @time: 2024",
  ],
  comparison: [
    "Compare Microsoft and Google on AI infrastructure spending @time: 2024-2025",
    "Compare Nvidia and AMD on data center demand @time: 2025Q1",
    "Compare Walmart and Target on consumer weakness @time: 2024",
  ],
} as const;

export const DATASET_ATTRIBUTION = {
  name: "glopardo/sp500-earnings-transcripts",
  url: "https://huggingface.co/datasets/glopardo/sp500-earnings-transcripts",
  fullCoverage: "2013Q2–2025Q1",
  demoCoverage: "2024Q1–2025Q1",
} as const;
