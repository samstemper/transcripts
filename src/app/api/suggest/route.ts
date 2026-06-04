import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import type { FilterFieldKey } from "@/lib/autocomplete";
import { getStaticValueSuggestions } from "@/lib/autocomplete";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const field = (searchParams.get("field") ?? "") as FilterFieldKey;
  const q = (searchParams.get("q") ?? "").trim();

  if (!field) {
    return NextResponse.json({ suggestions: [] });
  }

  const staticSuggestions = getStaticValueSuggestions(
    field,
    q,
    config.demoMinPeriod(),
    config.demoMaxPeriod()
  );
  if (staticSuggestions.length > 0 || field === "quarter") {
    return NextResponse.json({ suggestions: staticSuggestions });
  }

  try {
    const supabase = getSupabase();

    if (field === "company" || field === "ticker") {
      const escaped = q.replace(/[%_,]/g, "");
      const pattern = `%${escaped}%`;
      let query = supabase
        .from("companies")
        .select("company_name, ticker")
        .or(`company_name.ilike.${pattern},ticker.ilike.${pattern}`)
        .order("company_name")
        .limit(12);

      const demoTickers = config.demoTickers();
      if (demoTickers?.length) {
        query = query.in("ticker", demoTickers);
      }

      const { data, error } = await query;

      if (error) throw error;

      const suggestions =
        field === "ticker"
          ? (data ?? []).map((row) => ({
              value: row.ticker,
              label: row.ticker,
              hint: row.company_name,
            }))
          : (data ?? []).map((row) => ({
              value: row.company_name,
              label: row.company_name,
              hint: row.ticker,
            }));

      return NextResponse.json({ suggestions });
    }

    return NextResponse.json({ suggestions: [] });
  } catch (error) {
    console.error("Suggest error:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
