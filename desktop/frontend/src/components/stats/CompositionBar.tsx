import type { TokenUsage } from "../../types";
import { formatPercent, formatTokenCount } from "../../agentUsageFormat";
import { tokenTypeSegments, type TokenTypeKey } from "./statsDerive";

const RAMP: Record<TokenTypeKey, number> = {
  input: 1,
  cached: 0.66,
  output: 0.42,
  reasoning: 0.24,
};

interface CompositionBarProps {
  totals: TokenUsage;
}

export function CompositionBar({ totals }: CompositionBarProps) {
  const segments = tokenTypeSegments(totals).filter((segment) => segment.value > 0);

  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px]">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              flexGrow: segment.value,
              backgroundColor: "var(--text-secondary)",
              opacity: RAMP[segment.key],
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="group flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"
          >
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: "var(--text-secondary)", opacity: RAMP[segment.key] }}
            />
            <span className="text-[var(--text-secondary)]">{segment.label}</span>
            <span className="tabular-nums group-hover:hidden">{formatPercent(segment.pct)}</span>
            <span className="hidden tabular-nums group-hover:inline">
              {formatTokenCount(segment.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
