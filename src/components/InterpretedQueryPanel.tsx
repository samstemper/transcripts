"use client";

interface InterpretedQueryProps {
  topic: string;
  companies: string[];
  period: string;
  evidenceNote: string;
}

export function InterpretedQueryPanel({
  topic,
  companies,
  period,
  evidenceNote,
}: InterpretedQueryProps) {
  return (
    <div className="panel px-4 py-3 text-sm text-muted space-y-1">
      <p>
        <span className="text-foreground/60">I searched for:</span>{" "}
        <span className="text-foreground/90 font-medium">{topic}</span>
      </p>
      {companies.length > 0 && (
        <p>
          <span className="text-foreground/60">Companies:</span>{" "}
          <span className="text-foreground/90">{companies.join(", ")}</span>
        </p>
      )}
      <p>
        <span className="text-foreground/60">Period:</span>{" "}
        <span className="text-foreground/90">{period}</span>
      </p>
      <p>
        <span className="text-foreground/60">Evidence:</span>{" "}
        <span className="text-foreground/90">{evidenceNote}</span>
      </p>
    </div>
  );
}
