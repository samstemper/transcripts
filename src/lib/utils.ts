export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatPeriod(year: number, quarter: number): string {
  return `${year}Q${quarter}`;
}

export function parsePeriod(period: string): { year: number; quarter: number } | null {
  const match = period.match(/^(\d{4})Q([1-4])$/);
  if (!match) return null;
  return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) };
}

export function periodToSortKey(period: string): number {
  const parsed = parsePeriod(period);
  if (!parsed) return 0;
  return parsed.year * 10 + parsed.quarter;
}

export function comparePeriods(a: string, b: string): number {
  return periodToSortKey(a) - periodToSortKey(b);
}

export function getShareUrl(query: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("q", query);
  return url.toString();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function highlightText(
  text: string,
  highlights: string[] | undefined
): { text: string; highlighted: boolean }[] {
  if (!highlights?.length) {
    return [{ text, highlighted: false }];
  }

  const segments: { text: string; highlighted: boolean }[] = [];
  let remaining = text;

  for (const sentence of highlights) {
    const idx = remaining.toLowerCase().indexOf(sentence.toLowerCase());
    if (idx === -1) continue;

    if (idx > 0) {
      segments.push({ text: remaining.slice(0, idx), highlighted: false });
    }
    segments.push({
      text: remaining.slice(idx, idx + sentence.length),
      highlighted: true,
    });
    remaining = remaining.slice(idx + sentence.length);
  }

  if (remaining) {
    segments.push({ text: remaining, highlighted: false });
  }

  return segments.length ? segments : [{ text, highlighted: false }];
}

export function stripInlineFilters(query: string): string {
  return query
    .replace(/@\w+:\s*[^\s@]+(?:\s*-\s*[^\s@]+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
