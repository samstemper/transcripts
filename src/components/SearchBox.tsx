"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  KeyboardEvent,
  FormEvent,
} from "react";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAutocompleteContext,
  getFieldSuggestions,
  applySuggestion,
  type SuggestionItem,
  type AutocompleteContext,
} from "@/lib/autocomplete";

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
  const listRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [context, setContext] = useState<AutocompleteContext | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const updateSuggestions = useCallback(
    async (text: string, cursorPos: number) => {
      const ctx = getAutocompleteContext(text, cursorPos);
      setContext(ctx);

      if (!ctx) {
        setSuggestions([]);
        setActiveIndex(0);
        return;
      }

      if (ctx.mode === "field") {
        setSuggestions(getFieldSuggestions(ctx.prefix));
        setActiveIndex(0);
        return;
      }

      if (ctx.field === "quarter") {
        const { getStaticValueSuggestions } = await import("@/lib/autocomplete");
        const { config } = await import("@/lib/config");
        setSuggestions(
          getStaticValueSuggestions(
            ctx.field,
            ctx.prefix,
            config.demoMinPeriod(),
            config.demoMaxPeriod()
          )
        );
        setActiveIndex(0);
        return;
      }

      setFetching(true);
      try {
        const params = new URLSearchParams({
          field: ctx.field!,
          q: ctx.prefix,
        });
        const res = await fetch(`/api/suggest?${params}`);
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setActiveIndex(0);
      } catch {
        setSuggestions([]);
      } finally {
        setFetching(false);
      }
    },
    []
  );

  useEffect(() => {
    const ctx = getAutocompleteContext(value, cursor);
    const delay =
      ctx?.mode === "value" && ctx.field !== "quarter" ? 150 : 0;
    const timer = setTimeout(() => {
      updateSuggestions(value, cursor);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, cursor, updateSuggestions]);

  const selectSuggestion = (item: SuggestionItem) => {
    if (!context) return;
    const { newText, newCursor } = applySuggestion(value, context, item);
    onChange(newText);
    setSuggestions([]);
    setContext(null);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(newCursor, newCursor);
      inputRef.current?.focus();
      setCursor(newCursor);
    });
  };

  const showDropdown = suggestions.length > 0 && context !== null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (showDropdown && suggestions[activeIndex]) {
      selectSuggestion(suggestions[activeIndex]);
      return;
    }
    if (value.trim() && !loading) onSubmit(value.trim());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        setContext(null);
        return;
      }
      if (e.key === "Tab" && suggestions[activeIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showDropdown && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (value.trim() && !loading) onSubmit(value.trim());
    }
  };

  const dropdownTitle =
    context?.mode === "field"
      ? "Filters"
      : context?.field
        ? `@${context.field}`
        : "";

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div className="relative flex items-center">
        <Search
          className={cn(
            "absolute left-4 text-muted pointer-events-none z-10",
            compact ? "w-4 h-4" : "w-5 h-5"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) =>
            setCursor(e.currentTarget.selectionStart ?? value.length)
          }
          onKeyUp={(e) =>
            setCursor(e.currentTarget.selectionStart ?? value.length)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask about Mag 7 earnings calls…"
          disabled={loading}
          autoComplete="off"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={showDropdown ? "query-suggestions" : undefined}
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
            "absolute right-2 flex items-center gap-1.5 px-4 py-2 rounded-xl z-10",
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

      {showDropdown && (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 mt-2 panel overflow-hidden shadow-lg",
            compact ? "top-full" : "top-full"
          )}
        >
          <div className="px-3 py-2 text-xs font-medium text-muted border-b border-border flex items-center justify-between">
            <span>{dropdownTitle}</span>
            {fetching && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <ul
            ref={listRef}
            id="query-suggestions"
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
          >
            {suggestions.map((item, index) => (
              <li key={`${item.value}-${index}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(item)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex items-baseline justify-between gap-3",
                    index === activeIndex
                      ? "bg-accent/10 text-foreground"
                      : "hover:bg-border/40 text-foreground/90"
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs text-muted truncate">{item.hint}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
