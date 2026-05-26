"use client";

import { EXAMPLE_QUERIES } from "@/lib/types";

interface ExampleQueriesProps {
  onSelect: (query: string) => void;
}

export function ExampleQueries({ onSelect }: ExampleQueriesProps) {
  const sections = [
    { label: "Broad discovery", queries: EXAMPLE_QUERIES.discovery },
    { label: "Company-specific", queries: EXAMPLE_QUERIES.targeted },
    { label: "Comparison", queries: EXAMPLE_QUERIES.comparison },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.label}>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
            {section.label}
          </h3>
          <div className="flex flex-wrap gap-2">
            {section.queries.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onSelect(query)}
                className="chip max-w-full"
              >
                <span className="truncate">{query}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
