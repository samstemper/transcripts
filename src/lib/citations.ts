import type { Citation, RetrievedChunk } from "./types";
import { formatSpeakerLabel, resolveSpeaker } from "./speaker";

function chunkToCitation(chunk: RetrievedChunk, index: number): Citation {
  const { speaker, role } = resolveSpeaker(chunk);
  return {
    index,
    chunk_id: chunk.id,
    ticker: chunk.ticker,
    company_name: chunk.company_name,
    period_string: chunk.period_string,
    speaker: formatSpeakerLabel(speaker, role),
    excerpt: chunk.chunk_text.slice(0, 300) + (chunk.chunk_text.length > 300 ? "…" : ""),
    call_date: (chunk.metadata?.call_date as string) ?? null,
  };
}

export function renumberAnswerCitations(
  answer: string,
  chunks: RetrievedChunk[]
): {
  answer: string;
  citations: Citation[];
  reorderedEvidence: RetrievedChunk[];
} {
  if (chunks.length === 0) {
    return { answer, citations: [], reorderedEvidence: [] };
  }

  const appearanceOrder: number[] = [];
  const seen = new Set<number>();

  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const oldNum = parseInt(match[1], 10);
    if (oldNum < 1 || oldNum > chunks.length || seen.has(oldNum)) continue;
    seen.add(oldNum);
    appearanceOrder.push(oldNum);
  }

  if (appearanceOrder.length === 0) {
    return {
      answer,
      citations: chunks.map((chunk, i) => chunkToCitation(chunk, i + 1)),
      reorderedEvidence: chunks,
    };
  }

  const oldToNew = new Map<number, number>();
  appearanceOrder.forEach((oldNum, i) => oldToNew.set(oldNum, i + 1));

  const renumberedAnswer = answer.replace(/\[(\d+)\]/g, (marker, numStr) => {
    const oldNum = parseInt(numStr, 10);
    const newNum = oldToNew.get(oldNum);
    return newNum !== undefined ? `[${newNum}]` : marker;
  });

  const citedChunks = appearanceOrder.map((oldNum) => chunks[oldNum - 1]);
  const citedIds = new Set(citedChunks.map((chunk) => chunk.id));
  const uncitedChunks = chunks.filter((chunk) => !citedIds.has(chunk.id));

  return {
    answer: renumberedAnswer,
    citations: citedChunks.map((chunk, i) => chunkToCitation(chunk, i + 1)),
    reorderedEvidence: [...citedChunks, ...uncitedChunks],
  };
}
