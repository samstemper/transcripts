export const FILTER_FIELDS = [
  { key: "company", label: "company", hint: "Company name" },
  { key: "ticker", label: "ticker", hint: "Stock ticker" },
  { key: "quarter", label: "quarter", hint: "e.g. 2025Q1" },
] as const;

export type FilterFieldKey = (typeof FILTER_FIELDS)[number]["key"];

export interface AutocompleteContext {
  mode: "field" | "value";
  field?: FilterFieldKey;
  prefix: string;
  replaceStart: number;
  replaceEnd: number;
}

export interface SuggestionItem {
  value: string;
  label: string;
  hint?: string;
}

export function getAutocompleteContext(
  text: string,
  cursor: number
): AutocompleteContext | null {
  const before = text.slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex === -1) return null;

  const fragment = before.slice(atIndex);

  const valueMatch = fragment.match(
    /^@(company|ticker|quarter):\s*(.*)$/i
  );
  if (valueMatch) {
    const field = valueMatch[1].toLowerCase() as FilterFieldKey;
    const prefix = valueMatch[2];
    const valueStart = atIndex + fragment.length - prefix.length;
    return {
      mode: "value",
      field,
      prefix,
      replaceStart: valueStart,
      replaceEnd: cursor,
    };
  }

  const fieldMatch = fragment.match(/^@(\w*)$/);
  if (fieldMatch) {
    return {
      mode: "field",
      prefix: fieldMatch[1],
      replaceStart: atIndex,
      replaceEnd: cursor,
    };
  }

  return null;
}

export function getFieldSuggestions(prefix: string): SuggestionItem[] {
  const lower = prefix.toLowerCase();
  return FILTER_FIELDS.filter((f) => f.key.startsWith(lower)).map((f) => ({
    value: f.key,
    label: f.label,
    hint: f.hint,
  }));
}

export function getStaticValueSuggestions(
  field: FilterFieldKey,
  prefix: string,
  demoMin = "2024Q1",
  demoMax = "2025Q1"
): SuggestionItem[] {
  const lower = prefix.toLowerCase();

  if (field === "quarter") {
    const options = buildQuarterOptions(demoMin, demoMax);
    return options
      .filter((o) => o.toLowerCase().startsWith(lower))
      .map((o) => ({ value: o, label: o }));
  }

  return [];
}

function buildQuarterOptions(min: string, max: string): string[] {
  const parse = (p: string) => ({
    y: parseInt(p.slice(0, 4), 10),
    q: parseInt(p.slice(5), 10),
  });
  const start = parse(min);
  const end = parse(max);
  const periods: string[] = [];
  let y = start.y;
  let q = start.q;
  while (y < end.y || (y === end.y && q <= end.q)) {
    periods.push(`${y}Q${q}`);
    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
  }
  return periods;
}

export function applySuggestion(
  text: string,
  context: AutocompleteContext,
  item: SuggestionItem
): { newText: string; newCursor: number } {
  if (context.mode === "field") {
    const before = text.slice(0, context.replaceStart);
    const after = text.slice(context.replaceEnd);
    const insertion = `@${item.value}: `;
    const newText = before + insertion + after;
    return { newText, newCursor: before.length + insertion.length };
  }

  const before = text.slice(0, context.replaceStart);
  const after = text.slice(context.replaceEnd);
  const newText = before + item.value + " " + after;
  return { newText, newCursor: before.length + item.value.length + 1 };
}
