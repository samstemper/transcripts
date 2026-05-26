"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, highlightText } from "@/lib/utils";
import {
  formatSpeakerLabel,
  hasMultipleSpeakers,
  resolveSpeaker,
  splitChunkBySpeaker,
  type SpeakerRole,
} from "@/lib/speaker";
import type { RetrievedChunk } from "@/lib/types";

interface EvidencePanelProps {
  chunks: RetrievedChunk[];
  activeIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function speakerRoleBadge(role: SpeakerRole): string | null {
  switch (role) {
    case "executive":
      return "Management";
    case "analyst":
      return "Analyst";
    case "operator":
      return "Operator";
    default:
      return null;
  }
}

export function EvidencePanel({
  chunks,
  activeIndex,
  onClose,
  onNavigate,
}: EvidencePanelProps) {
  if (activeIndex === null || !chunks[activeIndex - 1]) return null;

  const chunk = chunks[activeIndex - 1];
  const callDate = (chunk.metadata?.call_date as string) ?? null;
  const resolvedSpeaker = resolveSpeaker(chunk);
  const speakerLabel =
    formatSpeakerLabel(resolvedSpeaker.speaker, resolvedSpeaker.role) ?? chunk.speaker;
  const speakerBadge = speakerRoleBadge(resolvedSpeaker.role);
  const speakerSegments = hasMultipleSpeakers(chunk.chunk_text)
    ? splitChunkBySpeaker(chunk.chunk_text)
    : null;
  const segments = highlightText(chunk.chunk_text, chunk.highlight_sentences);

  const hasPrev = activeIndex > 1;
  const hasNext = activeIndex < chunks.length;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 lg:hidden"
        onClick={onClose}
      />

      <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="citation-marker citation-marker-active">{activeIndex}</span>
            <span className="text-sm font-medium">Evidence</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => hasPrev && onNavigate(activeIndex - 1)}
              disabled={!hasPrev}
              className="p-1.5 rounded-lg hover:bg-border/50 disabled:opacity-30 transition-colors"
              aria-label="Previous citation"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => hasNext && onNavigate(activeIndex + 1)}
              disabled={!hasNext}
              className="p-1.5 rounded-lg hover:bg-border/50 disabled:opacity-30 transition-colors"
              aria-label="Next citation"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-border/50 transition-colors ml-1"
              aria-label="Close evidence panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-5 py-4 border-b border-border space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold">{chunk.company_name}</h3>
            <span className="text-sm text-muted font-mono">{chunk.ticker}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>{chunk.period_string}</span>
            {callDate && <span>{callDate}</span>}
            {chunk.sector && <span>{chunk.sector}</span>}
            {speakerLabel && (
              <span className="text-foreground/70">
                {speakerLabel}
                {speakerBadge &&
                  !speakerLabel.toLowerCase().includes(speakerBadge.toLowerCase()) && (
                    <span className="ml-1.5 rounded bg-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {speakerBadge}
                    </span>
                  )}
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            Relevance: {(chunk.similarity * 100).toFixed(0)}%
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {chunk.context_before && (
            <div className="text-sm text-muted/70 leading-relaxed border-l-2 border-border pl-3">
              {chunk.context_before.slice(0, 400)}
              {chunk.context_before.length > 400 && "…"}
            </div>
          )}

          <div className="text-sm leading-relaxed text-foreground/90">
            {speakerSegments ? (
              <div className="space-y-4">
                {speakerSegments.map((segment, segmentIndex) => {
                  const segmentHighlights = highlightText(
                    segment.text,
                    chunk.highlight_sentences
                  );
                  const badge = speakerRoleBadge(segment.role);

                  return (
                    <div key={segmentIndex}>
                      {segment.speaker && (
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                          <span>{segment.speaker}</span>
                          {badge && (
                            <span className="rounded bg-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                              {badge}
                            </span>
                          )}
                        </div>
                      )}
                      <div>
                        {segmentHighlights.map((seg, i) => (
                          <span
                            key={i}
                            className={cn(
                              seg.highlighted && "bg-yellow-100/80 font-medium px-0.5 rounded"
                            )}
                          >
                            {seg.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              segments.map((seg, i) => (
                <span
                  key={i}
                  className={cn(seg.highlighted && "bg-yellow-100/80 font-medium px-0.5 rounded")}
                >
                  {seg.text}
                </span>
              ))
            )}
          </div>

          {chunk.context_after && (
            <div className="text-sm text-muted/70 leading-relaxed border-l-2 border-border pl-3">
              {chunk.context_after.slice(0, 400)}
              {chunk.context_after.length > 400 && "…"}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
