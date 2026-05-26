"use client";

import { useState } from "react";
import { Copy, Check, AlertCircle } from "lucide-react";
import { SearchBox } from "./SearchBox";
import { InterpretedQueryPanel } from "./InterpretedQueryPanel";
import { AnswerDisplay } from "./AnswerDisplay";
import { EvidencePanel } from "./EvidencePanel";
import { getShareUrl, copyToClipboard } from "@/lib/utils";
import type { SearchResponse } from "@/lib/types";

interface SearchResultsProps {
  query: string;
  result: SearchResponse | null;
  loading: boolean;
  error: string | null;
  onSearch: (query: string) => void;
}

export function SearchResults({
  query,
  result,
  loading,
  error,
  onSearch,
}: SearchResultsProps) {
  const [inputValue, setInputValue] = useState(query);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = getShareUrl(query);
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header with search */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <SearchBox
            value={inputValue}
            onChange={setInputValue}
            onSubmit={onSearch}
            loading={loading}
            compact
          />
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Main content */}
        <main
          className={`flex-1 transition-all duration-300 ${
            activeCitation !== null ? "lg:mr-96" : ""
          }`}
        >
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {result && !error && (
              <InterpretedQueryPanel
                topic={result.interpreted_query.topic}
                companies={result.interpreted_query.companies}
                period={result.interpreted_query.period}
                evidenceNote={result.interpreted_query.evidence_note}
              />
            )}

            {loading && (
              <div className="panel p-8 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <p className="text-sm text-muted">Searching transcripts and generating answer…</p>
              </div>
            )}

            {error && (
              <div className="panel p-5 flex items-start gap-3 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {result && !loading && !error && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Answer</h2>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-border/50"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy link
                      </>
                    )}
                  </button>
                </div>

                <div className="panel p-6">
                  <AnswerDisplay
                    answer={result.answer}
                    citations={result.citations}
                    activeCitation={activeCitation}
                    onCitationClick={setActiveCitation}
                  />
                </div>

                <p className="text-xs text-muted px-1">
                  Answers are generated from retrieved transcript excerpts and may contain mistakes.
                  Always check the cited evidence.
                </p>
              </>
            )}
          </div>
        </main>

        {/* Evidence panel */}
        {result && activeCitation !== null && (
          <EvidencePanel
            chunks={result.evidence}
            activeIndex={activeCitation}
            onClose={() => setActiveCitation(null)}
            onNavigate={setActiveCitation}
          />
        )}
      </div>
    </div>
  );
}
