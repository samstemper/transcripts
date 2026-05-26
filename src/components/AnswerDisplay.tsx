"use client";

import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/types";

interface AnswerDisplayProps {
  answer: string;
  citations: Citation[];
  activeCitation: number | null;
  onCitationClick: (index: number) => void;
}

function CitationButton({
  num,
  active,
  onClick,
}: {
  num: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("citation-marker", active && "citation-marker-active")}
    >
      {num}
    </button>
  );
}

function renderInline(text: string, activeCitation: number | null, onCitationClick: (n: number) => void) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return (
        <CitationButton
          key={i}
          num={num}
          active={activeCitation === num}
          onClick={() => onCitationClick(num)}
        />
      );
    }
    // Handle **bold**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      const boldMatch = bp.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        return <strong key={`${i}-${j}`}>{boldMatch[1]}</strong>;
      }
      return <span key={`${i}-${j}`}>{bp}</span>;
    });
  });
}

export function AnswerDisplay({
  answer,
  activeCitation,
  onCitationClick,
}: AnswerDisplayProps) {
  const lines = answer.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={key} className="list-disc pl-5 mb-3 space-y-1">
        {listItems.map((item, i) => (
          <li key={i} className="leading-relaxed text-foreground/90">
            {renderInline(item, activeCitation, onCitationClick)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      flushList(`list-${idx}`);
      elements.push(
        <h3 key={idx} className="text-base font-semibold mt-5 mb-2 first:mt-0">
          {trimmed.slice(4)}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(`list-${idx}`);
      elements.push(
        <h2 key={idx} className="text-lg font-semibold mt-5 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList(`list-${idx}`);
    } else {
      flushList(`list-${idx}`);
      elements.push(
        <p key={idx} className="mb-3 leading-relaxed text-foreground/90">
          {renderInline(trimmed, activeCitation, onCitationClick)}
        </p>
      );
    }
  });

  flushList("list-final");

  return <div className="answer-content">{elements}</div>;
}
