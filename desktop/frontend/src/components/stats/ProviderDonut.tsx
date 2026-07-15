import { useEffect, useState } from "react";
import type { UsageBreakdown } from "../../types";
import { formatPercent, formatTokenCount } from "../../agentUsageFormat";
import { providerMeta, providerShare } from "./statsDerive";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const SIZE = 140;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

interface ProviderDonutProps {
  providers: UsageBreakdown[];
  total: number;
}

export function ProviderDonut({ providers, total }: ProviderDonutProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reducedMotion);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, providers, total]);

  const visible = providers.filter((provider) => provider.tokens.totalTokens > 0);
  const single = visible.length === 1;

  let cursor = 0;
  const arcs = visible.map((provider) => {
    const fraction = providerShare(provider.tokens.totalTokens, total);
    const start = cursor;
    cursor += fraction;
    const meta = providerMeta(provider.key);
    const full = fraction * CIRCUMFERENCE;
    const visibleLen = single ? CIRCUMFERENCE : Math.max(0, full - GAP);
    const startLen = single ? 0 : start * CIRCUMFERENCE + GAP / 2;
    return { key: provider.key, color: meta.color, visibleLen, startLen };
  });

  const active = hovered ? providers.find((provider) => provider.key === hovered) : null;
  const centerValue = active
    ? formatTokenCount(active.tokens.totalTokens)
    : formatTokenCount(total);
  const centerCaption = active
    ? `${formatPercent(providerShare(active.tokens.totalTokens, total))} · ${active.sessions} session${active.sessions === 1 ? "" : "s"}`
    : "tokens";

  return (
    <div>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="butt"
                style={{
                  stroke: arc.color,
                  strokeDasharray: `${drawn ? arc.visibleLen : 0} ${CIRCUMFERENCE}`,
                  strokeDashoffset: -arc.startLen,
                  opacity: hovered && hovered !== arc.key ? 0.3 : 1,
                  transition: reducedMotion
                    ? "opacity 120ms ease-out"
                    : "stroke-dasharray 500ms ease-out, opacity 120ms ease-out",
                }}
                onMouseEnter={() => setHovered(arc.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)]">
            {centerValue}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{centerCaption}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {providers.map((provider) => {
          const meta = providerMeta(provider.key);
          const share = providerShare(provider.tokens.totalTokens, total);
          const dim = hovered && hovered !== provider.key;
          return (
            <div
              key={provider.key}
              onMouseEnter={() => setHovered(provider.key)}
              onMouseLeave={() => setHovered(null)}
              className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 transition-[background-color,opacity] duration-[120ms] hover:bg-[var(--bg-hover)]"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {meta.label}
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--text-primary)]">
                    {formatPercent(share)}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                  <span className="tabular-nums">{formatTokenCount(provider.tokens.totalTokens)}</span>
                  <span className="tabular-nums">
                    {provider.sessions} session{provider.sessions === 1 ? "" : "s"}
                  </span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
