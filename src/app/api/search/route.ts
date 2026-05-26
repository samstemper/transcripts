import { NextRequest, NextResponse } from "next/server";
import { parseQuery, buildInterpretedQuery } from "@/lib/query-parser";
import { retrieveForPlan } from "@/lib/retrieval";
import { generateAnswer, extractHighlights } from "@/lib/answer-generator";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { config } from "@/lib/config";
import { isOpenAIError } from "@/lib/openai";
import type { SearchResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment before trying again." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetAt),
          },
        }
      );
    }

    const body = await request.json();
    const rawQuery = (body.query ?? "").trim();

    if (!rawQuery) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    if (rawQuery.length > config.maxQueryLength()) {
      return NextResponse.json(
        { error: `Query too long. Maximum ${config.maxQueryLength()} characters.` },
        { status: 400 }
      );
    }

    if (/^(what about|and what|how about|tell me more)/i.test(rawQuery) && rawQuery.split(" ").length < 8) {
      return NextResponse.json(
        {
          error:
            "Each query is standalone. Please restate your full question with company names, topic, and time period.",
        },
        { status: 400 }
      );
    }

    const { plan, timeError } = await parseQuery(rawQuery);

    if (timeError) {
      const response: SearchResponse = {
        parsed_plan: plan,
        interpreted_query: buildInterpretedQuery(plan),
        answer: timeError,
        citations: [],
        evidence: [],
        warning: timeError,
      };
      return NextResponse.json(response);
    }

    const chunks = await retrieveForPlan(plan);

    const evidence = chunks.map((chunk) => ({
      ...chunk,
      highlight_sentences: extractHighlights(chunk.chunk_text, plan.semantic_topic),
    }));

    const { answer, citations, evidence: orderedEvidence } = await generateAnswer(plan, evidence);

    const response: SearchResponse = {
      parsed_plan: plan,
      interpreted_query: buildInterpretedQuery(plan),
      answer,
      citations,
      evidence: orderedEvidence,
    };

    return NextResponse.json(response, {
      headers: {
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error) {
    const openaiErr = isOpenAIError(error);
    if (openaiErr.status === 429) {
      return NextResponse.json(
        { error: "OpenAI rate limit reached. Please try again in a moment." },
        { status: 503 }
      );
    }
    if (openaiErr.status === 401) {
      return NextResponse.json(
        { error: "Service configuration error. Please contact the administrator." },
        { status: 503 }
      );
    }

    console.error("Search error:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your query. Please try again." },
      { status: 500 }
    );
  }
}
