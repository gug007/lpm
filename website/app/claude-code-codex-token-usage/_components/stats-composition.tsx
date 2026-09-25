"use client";

import { useState } from "react";
import type { CompositionPart } from "./stats-derive";
import { formatPercent, formatTokenCount, spokenPercent, spokenTokens } from "./stats-format";

const RAMP: Record<CompositionPart["key"], number> = {
  input: 1,
  cached: 0.66,
  output: 0.42,
  reasoning: 0.24,
};

export default function StatsComposition({ parts }: { parts: CompositionPart[] }) {
  const [revealed, setRevealed] = useState<CompositionPart["key"] | null>(null);
  const shown = parts.filter((part) => part.tokens > 0);

  return (
    <div>
      <p className="mb-2.5 text-[11px] font-medium text-[var(--text-muted)]">Token composition</p>
      <div aria-hidden className="flex h-2.5 w-full gap-[2px]">
        {shown.map((part) => (
          <div
            key={part.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              flexGrow: part.tokens,
              backgroundColor: "var(--text-secondary)",
              opacity: RAMP[part.key],
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-1 gap-y-0.5">
        {shown.map((part) => (
          <button
            key={part.key}
            type="button"
            aria-label={`${part.label}: ${spokenTokens(part.tokens)} tokens, ${spokenPercent(part.share)}`}
            onMouseEnter={() => setRevealed(part.key)}
            onMouseLeave={() => setRevealed(null)}
            onFocus={() => setRevealed(part.key)}
            onBlur={() => setRevealed(null)}
            className="flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: "var(--text-secondary)", opacity: RAMP[part.key] }}
            />
            {part.label}
            <span className="tabular-nums">
              {revealed === part.key ? formatTokenCount(part.tokens) : formatPercent(part.share)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
