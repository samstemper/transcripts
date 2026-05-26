"use client";

import { DATASET_ATTRIBUTION } from "@/lib/types";
import { ExternalLink } from "lucide-react";

export function AboutSection() {
  return (
    <section id="about" className="panel p-6 space-y-4">
      <h2 className="text-lg font-semibold">About / How it works</h2>
      <p className="text-sm text-foreground/80 leading-relaxed">
        This app searches recent S&amp;P 500 earnings-call transcripts. It combines structured
        filters, semantic retrieval, and cited answer generation. Answers are grounded in retrieved
        transcript excerpts; always check the cited evidence.
      </p>
      <div className="text-sm text-foreground/70 space-y-1">
        <p>
          <span className="font-medium text-foreground/80">Data source:</span>{" "}
          <a
            href={DATASET_ATTRIBUTION.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-1"
          >
            {DATASET_ATTRIBUTION.name} on Hugging Face
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
        <p>
          Source dataset coverage: {DATASET_ATTRIBUTION.fullCoverage}. This demo currently uses a
          recent subset, {DATASET_ATTRIBUTION.demoCoverage}.
        </p>
      </div>
    </section>
  );
}
