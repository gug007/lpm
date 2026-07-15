import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AgentSessionUsage } from "../../types";
import { formatDuration, formatTokenCount } from "../../agentUsageFormat";
import { relativeTime } from "../../relativeTime";
import { providerMeta } from "./statsDerive";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const fullTimestamp = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  );

interface SessionRowProps {
  session: AgentSessionUsage;
}

export function SessionRow({ session }: SessionRowProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const meta = providerMeta(session.provider);
  const total = session.tokens.totalTokens;

  const meters: { label: string; value: number }[] = [
    { label: "Input", value: session.tokens.inputTokens },
    { label: "Cached", value: session.tokens.cachedInputTokens },
    { label: "Output", value: session.tokens.outputTokens },
    { label: "Reasoning", value: session.tokens.reasoningTokens },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
        <span className="shrink-0 text-[var(--text-secondary)]">{meta.short}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{session.project}</span>
        <span
          className="max-w-[84px] shrink-0 truncate rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
          title={session.model}
        >
          {session.model}
        </span>
        <span className="w-9 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
          {formatDuration(session.lastAt - session.startedAt)}
        </span>
        <span className="w-10 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
          {relativeTime(Math.floor(session.lastAt / 1000))}
        </span>
        <span className="w-14 shrink-0 text-right font-medium tabular-nums">
          {formatTokenCount(total)}
        </span>
        <ChevronDown
          size={13}
          className="shrink-0 text-[var(--text-muted)] transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>

      <div
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reducedMotion ? "none" : "grid-template-rows 200ms ease-out",
        }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3 pt-0.5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {meters.map((meter) => (
                <div key={meter.label}>
                  <div className="flex items-baseline justify-between text-[10px]">
                    <span className="text-[var(--text-muted)]">{meter.label}</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">
                      {formatTokenCount(meter.value)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(meter.value / Math.max(1, total)) * 100}%`,
                        backgroundColor: "var(--text-secondary)",
                        opacity: 0.5,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-[var(--text-muted)]">
              Started {fullTimestamp(session.startedAt)} · Last {fullTimestamp(session.lastAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
