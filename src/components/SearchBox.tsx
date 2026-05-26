"use client";

import { useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  loading?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  loading = false,
  compact = false,
  autoFocus = false,
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() && !loading) onSubmit(value.trim());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading) onSubmit(value.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div className="relative flex items-center">
        <Search
          className={cn(
            "absolute left-4 text-muted pointer-events-none",
            compact ? "w-4 h-4" : "w-5 h-5"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about S&P 500 earnings calls…"
          disabled={loading}
          className={cn(
            "search-input",
            compact ? "py-3 pl-11 pr-24 text-sm rounded-xl" : "pl-12 pr-28"
          )}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className={cn(
            "absolute right-2 flex items-center gap-1.5 px-4 py-2 rounded-xl",
            "bg-accent text-white text-sm font-medium",
            "hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Search
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
