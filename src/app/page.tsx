"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { ExampleQueries } from "@/components/ExampleQueries";
import { AboutSection } from "@/components/AboutSection";
import { SearchResults } from "@/components/SearchResults";
import type { SearchResponse } from "@/lib/types";
import { DATASET_ATTRIBUTION } from "@/lib/types";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(!!initialQuery);

  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;

      setQuery(searchQuery);
      setInputValue(searchQuery);
      setLoading(true);
      setError(null);
      setHasSearched(true);

      // Update URL
      const params = new URLSearchParams();
      params.set("q", searchQuery);
      router.replace(`/?${params.toString()}`, { scroll: false });

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Search failed. Please try again.");
          setResult(null);
        } else {
          setResult(data);
          if (data.warning) {
            setError(null);
          }
        }
      } catch {
        setError("Network error. Please check your connection and try again.");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Auto-execute on page load with ?q= param
  useEffect(() => {
    if (initialQuery) {
      executeSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hasSearched) {
    return (
      <SearchResults
        query={query}
        result={result}
        loading={loading}
        error={error}
        onSearch={executeSearch}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">
              Earnings Insight
            </h1>
            <p className="text-muted text-lg">
              Ask natural-language questions over recent S&amp;P 500 earnings-call transcripts.
            </p>
          </div>

          <SearchBox
            value={inputValue}
            onChange={setInputValue}
            onSubmit={executeSearch}
            autoFocus
          />

          <ExampleQueries onSelect={executeSearch} />
        </div>
      </main>

      {/* About */}
      <footer className="border-t border-border bg-surface/50">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <AboutSection />
          <p className="text-xs text-muted mt-6 text-center">
            Demo corpus: {DATASET_ATTRIBUTION.demoCoverage} · Built with Next.js, Supabase, and
            OpenAI
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
