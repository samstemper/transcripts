/**
 * Vector retrieval backend abstraction.
 * Currently implemented with Supabase pgvector; can be swapped to Qdrant etc.
 */

import type { QueryPlan, RetrievedChunk } from "./types";

export interface VectorStore {
  search(plan: QueryPlan, embedding: number[], matchCount: number): Promise<RetrievedChunk[]>;
  resolveCompany(name: string): Promise<Array<{ id: string; ticker: string; company_name: string; sector: string | null }>>;
}

export type { RetrievedChunk, QueryPlan };
