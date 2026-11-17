import type { TokenUsage } from "../../types";
import { formatPercent, formatTokenCount } from "../../agentUsageFormat";
import { tokenTypeSegments, type TokenTypeKey } from "./statsDerive";

const shade = (pct: number) => `color-mix(in srgb, var(--text-primary) ${pct}%, transparent)`;
const stripes = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in srgb, ${color} 30%, transparent) 2px 4px)`;

// Four steps that never share a look: light, mid and dark solids, then the
// dark one striped for reasoning, the part of the output spent thinking.
const FILL: Record<TokenTypeKey, string> = {
  input: shade(85),
  cached: shade(55),
  output: shade(30),
  reasoning: stripes(shade(55)),
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
            style={{ flexGrow: segment.value, background: FILL[segment.key] }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <span
            key={segment.key}
            title={formatTokenCount(segment.value)}
            className="group flex cursor-help items-center gap-1.5 text-[12px] text-[var(--text-muted)]"
          >
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: FILL[segment.key] }}
            />
            <span className="text-[var(--text-secondary)]">{segment.label}</span>
            <span className="tabular-nums text-[var(--text-muted)] group-hover:hidden">
              {formatPercent(segment.pct)}
            </span>
            <span className="hidden tabular-nums text-[var(--text-muted)] group-hover:inline">
              {formatTokenCount(segment.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
