import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface SearchChunksParams {
  queryEmbedding: number[];
  matchCount?: number;
  filterTickers?: string[] | null;
  filterSectors?: string[] | null;
  filterPeriods?: string[] | null;
  filterYearMin?: number | null;
  filterYearMax?: number | null;
  filterQuarterMin?: number | null;
  filterQuarterMax?: number | null;
  similarityThreshold?: number;
}

export async function searchChunks(params: SearchChunksParams) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("search_chunks", {
    query_embedding: params.queryEmbedding,
    match_count: params.matchCount ?? 20,
    filter_tickers: params.filterTickers ?? null,
    filter_sectors: params.filterSectors ?? null,
    filter_periods: params.filterPeriods ?? null,
    filter_year_min: params.filterYearMin ?? null,
    filter_year_max: params.filterYearMax ?? null,
    filter_quarter_min: params.filterQuarterMin ?? null,
    filter_quarter_max: params.filterQuarterMax ?? null,
    similarity_threshold: params.similarityThreshold ?? 0.25,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return data ?? [];
}

export async function resolveCompany(searchTerm: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("resolve_company", {
    search_term: searchTerm,
  });
  if (error) throw new Error(`Company lookup failed: ${error.message}`);
  return data ?? [];
}

export async function getAdjacentChunks(transcriptId: string, chunkIndex: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_adjacent_chunks", {
    p_transcript_id: transcriptId,
    p_chunk_index: chunkIndex,
  });
  if (error) return [];
  return data ?? [];
}

export async function getCorpusMetadata() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("corpus_metadata")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return null;
  return data;
}

export async function getTranscriptCallDate(transcriptId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("transcripts")
    .select("call_date")
    .eq("id", transcriptId)
    .single();
  return data?.call_date ?? null;
}
