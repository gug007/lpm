import type { ProviderLimits } from "../hooks/useAgentLimits";
import {
  FIVE_HOUR_MS,
  STALE_MS,
  WEEKLY_MS,
  providerMeta,
  updatedText,
} from "./stats/limitsFormat";
import { UsageMeter } from "./UsageMeter";

interface UsageProviderCardProps {
  data: ProviderLimits;
  now: number;
  title: string;
  subtitle?: string;
}

export function UsageProviderCard({ data, now, title, subtitle }: UsageProviderCardProps) {
  const meta = providerMeta(data.provider);
  const stale = now - data.updatedAt > STALE_MS;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <header className="flex items-center gap-2 border-b border-[var(--border)]/50 pb-3">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: meta.dot, opacity: stale ? 0.5 : 1 }}
        />
        <span className="shrink-0 text-sm font-medium tracking-tight text-[var(--text-primary)]">
          {title}
        </span>
        {subtitle && (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {data.label && (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              {data.label}
            </span>
          )}
          <span
            className="text-[11px] tabular-nums text-[var(--text-muted)]"
            style={{ opacity: stale ? 0.6 : 1 }}
          >
            {updatedText(data.updatedAt, now)}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 pt-4">
        <UsageMeter
          label="5-hour"
          win={data.fiveHour}
          windowMs={FIVE_HOUR_MS}
          now={now}
          stale={stale}
        />
        <UsageMeter
          label="Weekly"
          win={data.weekly}
          windowMs={WEEKLY_MS}
          now={now}
          stale={stale}
        />
      </div>
    </section>
  );
}
