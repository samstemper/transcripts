import type { Citation, QueryPlan, RetrievedChunk } from "./types";
import { chatCompletion } from "./openai";
import { config } from "./config";
import { renumberAnswerCitations } from "./citations";
import { formatSpeakerLabel, resolveSpeaker } from "./speaker";

function formatEvidenceBlock(chunks: RetrievedChunk[], startIndex: number): string {
  return chunks
    .map((chunk, i) => {
      const idx = startIndex + i;
      const { speaker, role } = resolveSpeaker(chunk);
      const speakerLabel = formatSpeakerLabel(speaker, role);
      const speakerSuffix = speakerLabel ? ` (${speakerLabel})` : "";
      return `[${idx}] ${chunk.company_name} (${chunk.ticker}) — ${chunk.period_string}${speakerSuffix}:\n${chunk.chunk_text}`;
    })
    .join("\n\n---\n\n");
}

const ANSWER_SYSTEM = `You are a research assistant that answers questions ONLY from provided earnings call transcript excerpts.

CRITICAL RULES:
1. Answer ONLY using information from the provided excerpts. Do NOT use general knowledge.
2. Every substantive claim MUST include a citation marker like [1], [2], etc. matching the excerpt numbers.
3. If the excerpts don't contain enough information, say so clearly and suggest a narrower or different query.
4. Do not invent facts, numbers, or quotes not present in the excerpts.
5. Use clear, professional prose. Use markdown sparingly (bold for emphasis, bullet lists when helpful).
6. Be concise but thorough.
7. When answering what a company said, prioritize management/executive statements over analyst questions. Do not attribute analyst questions to the company.`;

const COMPARISON_SYSTEM = `You are a research assistant comparing companies based ONLY on provided earnings call transcript excerpts.

CRITICAL RULES:
1. Answer ONLY from the provided excerpts. Do NOT use general knowledge.
2. Structure your answer with:
   - A brief overview
   - Side-by-side sections for each company (use ### headers with company name)
   - A "### Key Differences" section with bullet points
3. Every substantive claim MUST include citation markers [1], [2], etc.
4. If evidence is insufficient for either company, state that clearly.
5. Do not invent facts not in the excerpts.
6. Prioritize management/executive statements over analyst questions when summarizing what each company said.`;

const DISCOVERY_SYSTEM = `You are a research assistant identifying which S&P 500 companies discussed a topic, based ONLY on provided earnings call excerpts.

CRITICAL RULES:
1. Answer ONLY from the provided excerpts. Do NOT use general knowledge.
2. Group findings by company. For each company, summarize what they said with citations.
3. Start with a brief overview of how many companies discussed the topic.
4. Every substantive claim MUST include citation markers [1], [2], etc.
5. If excerpts are insufficient, say so and suggest refining the query.
6. Do not mention companies not present in the excerpts.`;

function buildPrompt(plan: QueryPlan, chunks: RetrievedChunk[]): { system: string; user: string } {
  const evidence = formatEvidenceBlock(chunks, 1);

  let system: string;
  let instruction: string;

  switch (plan.query_type) {
    case "comparison":
      system = COMPARISON_SYSTEM;
      instruction = `Compare ${plan.comparison_entities.join(" and ")} on: ${plan.semantic_topic}`;
      break;
    case "discovery":
      system = DISCOVERY_SYSTEM;
      instruction = `Which companies discussed: ${plan.semantic_topic}`;
      break;
    default:
      system = ANSWER_SYSTEM;
      instruction = plan.companies.length
        ? `What did ${plan.companies.join(", ")} say about: ${plan.semantic_topic}`
        : `Answer this question: ${plan.semantic_topic}`;
  }

  const user = `${instruction}

Time period: ${plan.time_filter?.display ?? `${config.demoMinPeriod()}–${config.demoMaxPeriod()}`}

TRANSCRIPT EXCERPTS:
${evidence}

Remember: cite every claim with [N] markers. Only use information from the excerpts above.`;

  return { system, user };
}

export async function generateAnswer(
  plan: QueryPlan,
  chunks: RetrievedChunk[]
): Promise<{ answer: string; citations: Citation[]; evidence: RetrievedChunk[] }> {
  if (chunks.length === 0) {
    return {
      answer:
        "I couldn't find relevant transcript excerpts for this query. Try broadening the time range, checking the company name or ticker, or rephrasing the topic.",
      citations: [],
      evidence: [],
    };
  }

  const { system, user } = buildPrompt(plan, chunks);
  const rawAnswer = await chatCompletion(system, user, config.maxAnswerTokens());
  const { answer, citations, reorderedEvidence } = renumberAnswerCitations(rawAnswer, chunks);

  return { answer, citations, evidence: reorderedEvidence };
}

export function extractHighlights(chunkText: string, topic: string): string[] {
  const sentences = chunkText.match(/[^.!?]+[.!?]+/g) ?? [chunkText];
  const topicWords = topic
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3);

  const scored = sentences.map((s) => {
    const lower = s.toLowerCase();
    const score = topicWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    return { sentence: s.trim(), score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((s) => s.sentence);
}
