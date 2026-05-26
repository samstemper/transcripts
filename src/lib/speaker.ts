import type { RetrievedChunk } from "./types";

export type SpeakerRole = "executive" | "analyst" | "operator" | "unknown";

// Inline speaker turns: "...question? Tim Cook : Yes." (space before colon; no newline required)
const SPEAKER_LINE_PATTERN =
  /(?:^|[.!?]\s+|\n\s*)(Operator|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:\s*[-–—]\s*(CEO|CFO|COO|CTO|President|Analyst|Director|Chief [A-Za-z ]+ Officer|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))?\s+:\s+/g;

const EXECUTIVE_PATTERN =
  /\b(CEO|CFO|COO|CTO|President|Chief\s+\w+\s+Officer|Executive|Management)\b/i;
const ANALYST_PATTERN = /\bAnalyst\b/i;
const OPERATOR_PATTERN = /\bOperator\b/i;

export function classifySpeaker(speaker: string | null | undefined): SpeakerRole {
  if (!speaker?.trim()) return "unknown";
  if (OPERATOR_PATTERN.test(speaker)) return "operator";
  if (ANALYST_PATTERN.test(speaker)) return "analyst";
  if (EXECUTIVE_PATTERN.test(speaker)) return "executive";
  return "unknown";
}

function buildSpeakerLabel(name: string, rolePart?: string): string {
  const trimmedName = name.trim();
  const trimmedRole = rolePart?.trim();
  return trimmedRole ? `${trimmedName} - ${trimmedRole}` : trimmedName;
}

export function resolveSpeaker(chunk: Pick<RetrievedChunk, "speaker" | "chunk_text">): {
  speaker: string | null;
  role: SpeakerRole;
} {
  if (chunk.speaker?.trim()) {
    return { speaker: chunk.speaker.trim(), role: classifySpeaker(chunk.speaker) };
  }

  const segments = splitChunkBySpeaker(chunk.chunk_text);
  if (segments.length === 0) {
    return { speaker: null, role: "unknown" };
  }

  const executive = segments.find((segment) => segment.role === "executive");
  if (executive?.speaker) {
    return { speaker: executive.speaker, role: "executive" };
  }

  const nonOperator = segments.find(
    (segment) => segment.role !== "operator" && segment.speaker
  );
  if (nonOperator?.speaker) {
    return { speaker: nonOperator.speaker, role: nonOperator.role };
  }

  const first = segments.find((segment) => segment.speaker);
  if (first?.speaker) {
    return { speaker: first.speaker, role: first.role };
  }

  return { speaker: null, role: "unknown" };
}

export function formatSpeakerLabel(speaker: string | null, role: SpeakerRole): string | null {
  if (!speaker) return null;
  if (role === "executive" && !EXECUTIVE_PATTERN.test(speaker) && !ANALYST_PATTERN.test(speaker)) {
    return `${speaker} (Management)`;
  }
  if (role === "analyst" && !ANALYST_PATTERN.test(speaker)) {
    return `${speaker} (Analyst)`;
  }
  return speaker;
}

export function speakerRankBoost(role: SpeakerRole, preferManagement: boolean): number {
  if (!preferManagement) return 0;
  switch (role) {
    case "executive":
      return 0.04;
    case "unknown":
      return 0.01;
    case "operator":
      return -0.02;
    case "analyst":
      return -0.03;
    default:
      return 0;
  }
}

export interface SpeakerSegment {
  speaker: string;
  role: SpeakerRole;
  text: string;
}

export function splitChunkBySpeaker(text: string): SpeakerSegment[] {
  const matches = [...text.matchAll(SPEAKER_LINE_PATTERN)];
  if (matches.length === 0) {
    return [{ speaker: "", role: "unknown", text }];
  }

  const segments: SpeakerSegment[] = [];

  if (matches[0].index! > 0) {
    const preamble = text.slice(0, matches[0].index!).trim();
    if (preamble) {
      segments.push({ speaker: "", role: "unknown", text: preamble });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const speaker = buildSpeakerLabel(match[1], match[2]);
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const segmentText = text.slice(start, end).trim();
    if (segmentText) {
      segments.push({
        speaker,
        role: classifySpeaker(speaker),
        text: segmentText,
      });
    }
  }

  return segments.length > 0 ? segments : [{ speaker: "", role: "unknown", text }];
}

export function hasMultipleSpeakers(text: string): boolean {
  const speakers = splitChunkBySpeaker(text).filter((segment) => segment.speaker);
  return new Set(speakers.map((segment) => segment.speaker)).size > 1;
}
