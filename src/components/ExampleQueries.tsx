"use client";

import { EXAMPLE_QUERIES } from "@/lib/types";

interface ExampleQueriesProps {
  onSelect: (query: string) => void;
}

export function ExampleQueries({ onSelect }: ExampleQueriesProps) {
  return (
    <div className="w-full">
      <p className="text-xs font-medium uppercase tracking-wider text-muted text-center mb-3">
        Try an example
      </p>
      <div className="grid grid-cols-2 gap-3">
        {EXAMPLE_QUERIES.map((query) => (
          <button
            key={query}
            type="button"
            onClick={() => onSelect(query)}
            className="example-grid-card group text-left"
          >
            <span className="text-sm leading-snug text-foreground/85 group-hover:text-foreground line-clamp-2">
              {query}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
